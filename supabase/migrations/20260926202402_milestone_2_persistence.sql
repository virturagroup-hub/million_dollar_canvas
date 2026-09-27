-- Milestone 2: canonical vectors, no credits or realtime.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 40 and display_name !~ '[<>[:cntrl:]]'),
  created_at timestamptz not null default now()
);
create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  status text not null default 'draft' check (status in ('draft','open','closed','archived')),
  canvas_type text not null default 'community' check (canvas_type in ('community','development')),
  created_at timestamptz not null default now(),
  opens_at timestamptz,
  closes_at timestamptz,
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create table public.strokes (
  id uuid primary key default gen_random_uuid(),
  ordinal bigint generated always as identity unique,
  canvas_id uuid not null references public.canvases(id),
  user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  color text not null check (color ~ '^#[0-9A-F]{6}$'),
  width double precision not null check (width in (2,6,12)),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 1 and 3000 and octet_length(points::text) <= 160000),
  duration double precision not null check (duration between 0 and 15000),
  min_x double precision not null, min_y double precision not null,
  max_x double precision not null, max_y double precision not null,
  created_at timestamptz not null default now(),
  unique(user_id, request_id),
  check (min_x <= max_x and min_y <= max_y)
);
create table public.stroke_visibility (
  stroke_id uuid primary key references public.strokes(id),
  status text not null check (status in ('pending','approved','rejected','suppressed')),
  created_at timestamptz not null default now()
);
create index strokes_canvas_order on public.strokes(canvas_id, ordinal);
create index strokes_user_time on public.strokes(user_id, created_at);
create index strokes_canvas_bounds on public.strokes(canvas_id, min_x, max_x, min_y, max_y);
alter table public.profiles enable row level security;
alter table public.canvases enable row level security;
alter table public.strokes enable row level security;
alter table public.stroke_visibility enable row level security;
revoke all on public.profiles, public.canvases, public.strokes, public.stroke_visibility from anon, authenticated;
grant select on public.profiles, public.canvases, public.strokes, public.stroke_visibility to anon, authenticated;
grant all on public.profiles, public.canvases, public.strokes, public.stroke_visibility to service_role;
grant usage, select on sequence public.strokes_ordinal_seq to service_role;
create policy profiles_public on public.profiles for select to anon, authenticated using (true);
create policy canvases_public on public.canvases for select to anon, authenticated using (status <> 'draft');
create policy visibility_public on public.stroke_visibility for select to anon, authenticated using (status = 'approved');
create policy strokes_public on public.strokes for select to anon, authenticated using (
  exists(select 1 from public.canvases c where c.id = canvas_id and c.status <> 'draft') and
  exists(select 1 from public.stroke_visibility v where v.stroke_id = id and v.status = 'approved')
);

-- User metadata is used only for a validated display label, never authorization.
create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
declare label text;
begin
  label := btrim(new.raw_user_meta_data ->> 'display_name');
  if label is null or char_length(label) not between 2 and 40 or label ~ '[<>[:cntrl:]]' then
    label := 'Contributor';
  end if;
  insert into public.profiles(id,display_name) values(new.id,label);
  return new;
end $$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger create_profile after insert on auth.users for each row execute function private.create_profile();

create function private.immutable_stroke() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Canonical strokes are immutable'; end $$;
revoke all on function private.immutable_stroke() from public, anon, authenticated;
create trigger immutable_stroke before update or delete on public.strokes for each row execute function private.immutable_stroke();

-- The private definer is a trusted database write boundary. It derives identity
-- from the verified JWT, never a payload field, and validates all geometry again.
-- The canvas row lock makes the open-state check and insert atomic with closure.
create function private.submit_stroke(p_canvas_id uuid, p_request_id uuid, p_points jsonb, p_color text, p_width double precision, p_duration double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p_user_id uuid := auth.uid(); c public.canvases; existing public.strokes; result uuid; point jsonb;
  x double precision; y double precision; px double precision; py double precision; length double precision := 0;
  low_x double precision := 'Infinity'; low_y double precision := 'Infinity'; high_x double precision := '-Infinity'; high_y double precision := '-Infinity';
begin
  if p_user_id is null or p_request_id is null or not exists(select 1 from public.profiles where id = p_user_id) then raise exception 'Invalid user'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into c from public.canvases where id = p_canvas_id for update;
  if not found or c.status <> 'open' or c.opens_at > now() or c.closes_at <= now() then raise exception 'Canvas is closed'; end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array' then raise exception 'Invalid path'; end if;
  if jsonb_array_length(p_points) not between 1 and 3000 or octet_length(p_points::text) > 160000 then raise exception 'Invalid path size'; end if;
  if p_color is null or p_color !~ '^#[0-9A-F]{6}$' or p_width is null or p_width not in (2,6,12) or p_duration is null or p_duration not between 0 and 15000 then raise exception 'Invalid stroke properties'; end if;
  for point in select value from jsonb_array_elements(p_points) loop
    if jsonb_typeof(point) <> 'object' or jsonb_typeof(point->'x') is distinct from 'number' or jsonb_typeof(point->'y') is distinct from 'number' or (point - 'x' - 'y') <> '{}'::jsonb then raise exception 'Invalid point'; end if;
    x := (point->>'x')::double precision; y := (point->>'y')::double precision;
    if x not between 0 and c.width or y not between 0 and c.height then raise exception 'Out of bounds'; end if;
    if px is not null then length := length + sqrt((x-px)^2 + (y-py)^2); end if;
    if length > 12000 then raise exception 'Path is too long'; end if;
    low_x := least(low_x,x); low_y := least(low_y,y); high_x := greatest(high_x,x); high_y := greatest(high_y,y); px := x; py := y;
  end loop;
  select * into existing from public.strokes where user_id = p_user_id and request_id = p_request_id;
  if found then
    if existing.canvas_id <> p_canvas_id or existing.points <> p_points or existing.color <> p_color or existing.width <> p_width or existing.duration <> p_duration then raise exception 'Request ID conflict'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.strokes where user_id = p_user_id and created_at > now() - interval '1 minute') >= 10 then raise exception 'Stroke rate limit'; end if;
  insert into public.strokes(canvas_id,user_id,request_id,points,color,width,duration,min_x,min_y,max_x,max_y)
  values(p_canvas_id,p_user_id,p_request_id,p_points,p_color,p_width,p_duration,low_x-p_width/2,low_y-p_width/2,high_x+p_width/2,high_y+p_width/2) returning id into result;
  -- Temporary Milestone 2 policy: valid submissions are automatically approved.
  insert into public.stroke_visibility(stroke_id,status) values(result,'approved');
  return result;
end $$;
revoke all on function private.submit_stroke(uuid,uuid,jsonb,text,double precision,double precision) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.submit_stroke(uuid,uuid,jsonb,text,double precision,double precision) to authenticated;
-- PostgREST exposes only this invoker wrapper. Do not expose the private schema.
create function public.submit_stroke(p_canvas_id uuid, p_request_id uuid, p_points jsonb, p_color text, p_width double precision, p_duration double precision)
returns uuid language sql security invoker set search_path = '' as $$
  select private.submit_stroke(p_canvas_id,p_request_id,p_points,p_color,p_width,p_duration);
$$;
revoke all on function public.submit_stroke(uuid,uuid,jsonb,text,double precision,double precision) from public, anon, authenticated;
grant execute on function public.submit_stroke(uuid,uuid,jsonb,text,double precision,double precision) to authenticated;

insert into public.canvases(id,slug,title,description,width,height,status,canvas_type)
values('11111111-1111-4111-8111-111111111111','open-studio','Open Studio','One deliberate stroke at a time.',4000,3000,'open','development');
