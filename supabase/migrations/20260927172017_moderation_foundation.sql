begin;
create or replace function private.submit_stroke(p_canvas_id uuid, p_request_id uuid, p_points jsonb, p_color text, p_width double precision, p_duration double precision)
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
  -- Moderation is separate from immutable submission.
  insert into public.stroke_visibility(stroke_id,status) values(result,'pending');
  return result;
end $$;

-- No existing visibility rows are changed. Roles are granted manually by an
-- explicitly privileged database operator, never from editable Auth metadata.
create table public.user_roles (
  user_id uuid primary key references public.profiles(id),
  role text not null check(role in ('user','moderator','admin'))
);
create table public.role_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  old_role text, new_role text, actor uuid, database_actor text not null,
  created_at timestamptz not null default now()
);
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(), stroke_id uuid not null references public.strokes(id),
  previous_state text not null, new_state text not null,
  moderator_id uuid not null references public.profiles(id),
  category text not null, note text not null default '' check(char_length(note)<=1000),
  created_at timestamptz not null default now(),
  check ((previous_state,new_state) in (('pending','approved'),('pending','rejected'),('approved','suppressed'),('suppressed','approved')))
);
create index moderation_actions_stroke on public.moderation_actions(stroke_id,created_at);
create index visibility_queue on public.stroke_visibility(status,created_at,stroke_id);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id),
  target_type text not null check(target_type in ('stroke','region','profile')),
  stroke_id uuid references public.strokes(id), canvas_id uuid references public.canvases(id),
  profile_id uuid references public.profiles(id), region jsonb,
  category text not null check(category in ('explicit','hate','harassment','privacy','illegal','spam','other')),
  description text not null default '' check(char_length(description)<=500),
  created_at timestamptz not null default now(), status text not null default 'open' check(status in ('open','reviewed')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  check ((status='open' and reviewed_by is null and reviewed_at is null) or (status='reviewed' and reviewed_by is not null and reviewed_at is not null)),
  check (
    (target_type='stroke' and stroke_id is not null and canvas_id is null and profile_id is null and region is null) or
    (target_type='region' and stroke_id is null and canvas_id is not null and profile_id is null and region is not null and jsonb_typeof(region)='object') or
    (target_type='profile' and stroke_id is null and canvas_id is null and profile_id is not null and region is null)
  )
);
create unique index reports_open_duplicate on public.reports(reporter_id,stroke_id,category) where status='open' and target_type='stroke';
create index reports_user_time on public.reports(reporter_id,created_at);
create index reports_stroke_status on public.reports(stroke_id,status);
create table private.moderation_rate (
  user_id uuid primary key references public.profiles(id), started_at timestamptz not null, calls integer not null
);
alter table private.moderation_rate enable row level security;
revoke all on private.moderation_rate from public,anon,authenticated;
alter table public.user_roles enable row level security;
alter table public.role_history enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.reports enable row level security;
revoke all on public.user_roles,public.role_history,public.moderation_actions,public.reports from public,anon,authenticated;
-- All private data is accessed through narrow, identity-checking RPCs. No
-- moderator SELECT policy widens the existing public geometry read path.
create function private.audit_role() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.role_history(user_id,old_role,new_role,actor,database_actor)
  values(case when TG_OP='DELETE' then old.user_id else new.user_id end,
    case when TG_OP='INSERT' then null else old.role end,
    case when TG_OP='DELETE' then null else new.role end,auth.uid(),session_user);
  return null;
end $$;
create trigger audit_role after insert or update or delete on public.user_roles for each row execute function private.audit_role();
create trigger immutable_role_history before update or delete on public.role_history for each row execute function private.immutable_stroke();
create trigger immutable_moderation_history before update or delete on public.moderation_actions for each row execute function private.immutable_stroke();

create function private.my_role() returns text language sql stable security definer set search_path='' as $$
  select coalesce((select role from public.user_roles where user_id=auth.uid()),'user');
$$;
create function private.submission_receipt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',s.id,'status',v.status) into result
  from public.strokes s join public.stroke_visibility v on v.stroke_id=s.id
  where s.id=p_id and s.user_id=auth.uid();
  if result is null then raise exception 'Submission not found'; end if;
  return result;
end $$;

create function private.report_stroke(p_id uuid,p_category text,p_description text) returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); result uuid;
begin
  if who is null or not exists(select 1 from public.profiles where id=who) then raise exception 'Unauthorized'; end if;
  if p_category is null or p_category not in ('explicit','hate','harassment','privacy','illegal','spam','other') or p_description is null or char_length(p_description)>500 then raise exception 'Invalid report'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(who::text,4));
  if not exists(select 1 from public.strokes s join public.stroke_visibility v on v.stroke_id=s.id join public.canvases c on c.id=s.canvas_id where s.id=p_id and v.status='approved' and c.status<>'draft') then raise exception 'Artwork not found'; end if;
  if exists(select 1 from public.reports where reporter_id=who and stroke_id=p_id and category=p_category and status='open') then raise exception 'Duplicate report'; end if;
  if (select count(*) from public.reports where reporter_id=who and created_at>now()-interval '1 hour')>=5 then raise exception 'Report rate limit'; end if;
  insert into public.reports(reporter_id,target_type,stroke_id,category,description)
  values(who,'stroke',p_id,p_category,btrim(p_description)) returning id into result;
  return result;
end $$;

-- One bounded moderator boundary; authorization is repeated even when called
-- directly through PostgREST. Expected state makes concurrent reviews safe.
create function private.moderation(p_operation text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); target uuid; c_id uuid; current_state text; next_state text;
  category text; note text; result jsonb; candidate public.strokes; filter_state text;
  page_offset integer; rate_calls integer; role_value text;
begin
  select role into role_value from public.user_roles where user_id=who for share;
  if who is null or role_value is null or role_value not in ('moderator','admin') then raise exception 'Forbidden'; end if;
  insert into private.moderation_rate values(who,now(),1) on conflict(user_id) do update set
    calls=case when private.moderation_rate.started_at<now()-interval '1 minute' then 1 else private.moderation_rate.calls+1 end,
    started_at=case when private.moderation_rate.started_at<now()-interval '1 minute' then now() else private.moderation_rate.started_at end
    returning calls into rate_calls;
  if rate_calls>120 then raise exception 'Moderation rate limit'; end if;
  if p_operation='queue' then
    filter_state:=coalesce(p_payload->>'filter','pending'); page_offset:=coalesce((p_payload->>'offset')::integer,0);
    if filter_state not in ('pending','approved','rejected','suppressed','reported') or page_offset not between 0 and 10000 then raise exception 'Invalid queue'; end if;
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
      select s.id,s.created_at,p.display_name,c.title as canvas_title,v.status,
        (select count(*) from public.reports r where r.stroke_id=s.id and r.status='open') as report_count
      from public.strokes s join public.stroke_visibility v on v.stroke_id=s.id join public.profiles p on p.id=s.user_id join public.canvases c on c.id=s.canvas_id
      where (filter_state='reported' and exists(select 1 from public.reports r where r.stroke_id=s.id and r.status='open')) or v.status=filter_state
      order by report_count desc,s.created_at,s.id limit 20 offset page_offset
    ) q;
    return result;
  end if;
  target:=(p_payload->>'id')::uuid;
  if p_operation='resolve' then
    update public.reports set status='reviewed',reviewed_by=who,reviewed_at=now() where id=target and status='open';
    if not found then raise exception 'Report not found or already reviewed'; end if;
    return jsonb_build_object('ok',true);
  end if;
  select * into candidate from public.strokes where id=target;
  if not found then raise exception 'Artwork not found'; end if;
  c_id:=candidate.canvas_id;
  if p_operation='detail' then
    select jsonb_build_object('stroke',to_jsonb(candidate),'status',v.status,'displayName',p.display_name,'canvasTitle',c.title,
      'context',coalesce((select jsonb_agg(to_jsonb(q)) from (
        select s.id,s.ordinal,s.points,s.color,s.width from public.strokes s join public.stroke_visibility sv on sv.stroke_id=s.id
        where s.canvas_id=c_id and sv.status='approved' and s.id<>target
          and s.max_x>=candidate.min_x-100 and s.min_x<=candidate.max_x+100 and s.max_y>=candidate.min_y-100 and s.min_y<=candidate.max_y+100
        order by s.ordinal limit 201) q),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(to_jsonb(h)) from (select * from public.moderation_actions where stroke_id=target order by created_at desc,id limit 50) h),'[]'::jsonb),
      'reports',coalesce((select jsonb_agg(to_jsonb(r)) from (select rp.id,rp.category,rp.description,rp.status,rp.created_at from public.reports rp where rp.stroke_id=target order by (rp.status='open') desc,rp.created_at desc,rp.id limit 50) r),'[]'::jsonb)
    ) into result from public.stroke_visibility v join public.profiles p on p.id=candidate.user_id join public.canvases c on c.id=c_id where v.stroke_id=target;
    -- Never expose request nonce or private account/billing data to the dashboard.
    return jsonb_set(result,'{stroke}',(result->'stroke')-'request_id'-'user_id');
  elsif p_operation='transition' then
    -- Same lock order as submission/count maintenance: canvas then visibility.
    perform 1 from public.canvases where id=c_id for update;
    select status into current_state from public.stroke_visibility where stroke_id=target for update;
    next_state:=p_payload->>'state'; category:=p_payload->>'category'; note:=coalesce(p_payload->>'note','');
    if (p_payload->>'expected') is distinct from current_state then raise exception 'Review conflict; reload'; end if;
    if next_state is null or (current_state,next_state) not in (('pending','approved'),('pending','rejected'),('approved','suppressed'),('suppressed','approved')) then raise exception 'Invalid transition'; end if;
    if category is null or category not in ('acceptable','explicit','minors','hate','harassment','privacy','illegal','spam','evasion','other') or char_length(note)>1000 then raise exception 'Invalid reason'; end if;
    insert into public.moderation_actions(stroke_id,previous_state,new_state,moderator_id,category,note)
      values(target,current_state,next_state,who,category,btrim(note));
    update public.stroke_visibility set status=next_state where stroke_id=target;
    return jsonb_build_object('id',target,'status',next_state);
  end if;
  raise exception 'Invalid operation';
end $$;

-- Public invoker wrappers only. No new private table enters Realtime.
create function public.my_role() returns text language sql security invoker set search_path='' as $$ select private.my_role() $$;
create function public.submission_receipt(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.submission_receipt(p_id) $$;
create function public.report_stroke(p_id uuid,p_category text,p_description text) returns uuid language sql security invoker set search_path='' as $$ select private.report_stroke(p_id,p_category,p_description) $$;
create function public.moderation(p_operation text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.moderation(p_operation,p_payload) $$;
revoke all on function private.audit_role(),private.my_role(),private.submission_receipt(uuid),private.report_stroke(uuid,text,text),private.moderation(text,jsonb) from public,anon,authenticated;
revoke all on function public.my_role(),public.submission_receipt(uuid),public.report_stroke(uuid,text,text),public.moderation(text,jsonb) from public,anon,authenticated;
grant execute on function private.my_role(),private.submission_receipt(uuid),private.report_stroke(uuid,text,text),private.moderation(text,jsonb) to authenticated;
grant execute on function public.my_role(),public.submission_receipt(uuid),public.report_stroke(uuid,text,text),public.moderation(text,jsonb) to authenticated;
commit;

