-- Advisory rendering metadata only. No geometry, authors, or moderation state.
create table public.canvas_updates (
  canvas_id uuid primary key references public.canvases(id),
  version bigint not null default 0 check (version >= 0),
  reset_version bigint not null default 0 check (reset_version >= 0),
  last_ordinal bigint not null default 0 check (last_ordinal >= 0)
);
alter table public.canvas_updates enable row level security;
revoke all on public.canvas_updates from public, anon, authenticated;
grant select on public.canvas_updates to anon, authenticated;
grant all on public.canvas_updates to service_role;
create policy canvas_updates_public on public.canvas_updates for select to anon, authenticated using (
  exists(select 1 from public.canvases c where c.id = canvas_id and c.status <> 'draft')
);
insert into public.canvas_updates(canvas_id,last_ordinal)
select c.id,coalesce(max(s.ordinal) filter(where v.status='approved'),0) from public.canvases c
left join public.strokes s on s.canvas_id=c.id
left join public.stroke_visibility v on v.stroke_id=s.id group by c.id;

create function private.notify_artwork_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; position bigint; needs_reset boolean;
begin
  if TG_TABLE_NAME = 'canvases' then
    target := new.id; position := 0; needs_reset := true;
  else
    -- Hidden-to-hidden changes reveal nothing, even through notification counts.
    if TG_OP = 'INSERT' then
      if new.status <> 'approved' then return new; end if;
      needs_reset := false;
    elsif TG_OP = 'DELETE' then
      if old.status <> 'approved' then return old; end if;
      needs_reset := true;
    else
      if new.status = old.status or (new.status <> 'approved' and old.status <> 'approved') then return new; end if;
      needs_reset := true;
    end if;
    select canvas_id,ordinal into target,position from public.strokes
      where id = case when TG_OP = 'DELETE' then old.stroke_id else new.stroke_id end;
  end if;
  insert into public.canvas_updates(canvas_id,version,reset_version,last_ordinal)
    values(target,1,case when needs_reset then 1 else 0 end,position)
  on conflict(canvas_id) do update set
    version = public.canvas_updates.version + 1,
    reset_version = case when needs_reset or position <= public.canvas_updates.last_ordinal
      then public.canvas_updates.version + 1 else public.canvas_updates.reset_version end,
    last_ordinal = greatest(position,public.canvas_updates.last_ordinal);
  return null;
end $$;
revoke all on function private.notify_artwork_change() from public, anon, authenticated;
create trigger notify_artwork_visibility after insert or update or delete on public.stroke_visibility
  for each row execute function private.notify_artwork_change();
create trigger notify_artwork_canvas after insert or update on public.canvases
  for each row execute function private.notify_artwork_change();

-- A normal Supabase project already has this publication. The fallback also
-- permits a clean local PostgreSQL migration test without Supabase services.
do $$ begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.canvas_updates;
