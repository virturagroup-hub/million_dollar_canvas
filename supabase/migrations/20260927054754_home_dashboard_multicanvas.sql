begin;
-- Hold the existing write boundary during the count backfill/trigger switch.
lock table public.canvases, public.stroke_visibility, public.canvas_updates in access exclusive mode;
-- Product metadata only: existing canvas IDs, slugs, and strokes are preserved.
alter table public.canvases drop constraint canvases_canvas_type_check;
update public.canvases set canvas_type='community' where canvas_type='development';
alter table public.canvases add constraint canvases_canvas_type_check
  check(canvas_type in ('flagship','community','special'));
alter table public.canvases add column stroke_limit bigint check(stroke_limit > 0),
  add column credit_cost integer check(credit_cost > 0),
  add column display_order integer not null default 0;
alter table public.canvases add constraint flagship_limit
  check(canvas_type <> 'flagship' or (stroke_limit is not null and stroke_limit=1000000));
create unique index one_flagship on public.canvases(canvas_type) where canvas_type='flagship';
create index canvases_directory on public.canvases(status,display_order,slug);

alter table public.canvas_updates add column approved_count bigint not null default 0 check(approved_count >= 0);
update public.canvas_updates u set approved_count=(
  select count(*) from public.strokes s join public.stroke_visibility v on v.stroke_id=s.id
  where s.canvas_id=u.canvas_id and v.status='approved'
);

-- Incremental, reconcilable public totals. No repeated vector scan per homepage
-- visit. Row locking also enforces configured limits atomically with submission.
create function private.count_approved_strokes() returns trigger
language plpgsql security definer set search_path='' as $$
declare delta integer := 0; target uuid; maximum bigint; total bigint;
begin
  if TG_OP='UPDATE' and new.stroke_id<>old.stroke_id then raise exception 'Visibility stroke identity is immutable'; end if;
  if TG_OP <> 'INSERT' and old.status='approved' then delta := delta-1; end if;
  if TG_OP <> 'DELETE' and new.status='approved' then delta := delta+1; end if;
  if delta=0 then return null; end if;
  select canvas_id into target from public.strokes
    where id=case when TG_OP='DELETE' then old.stroke_id else new.stroke_id end;
  select stroke_limit into maximum from public.canvases where id=target for update;
  update public.canvas_updates set approved_count=approved_count+delta where canvas_id=target
    returning approved_count into total;
  if maximum is not null and total>maximum then raise exception 'Canvas stroke limit reached'; end if;
  return null;
end $$;
revoke all on function private.count_approved_strokes() from public,anon,authenticated;
create trigger count_approved_strokes after insert or update or delete on public.stroke_visibility
  for each row execute function private.count_approved_strokes();

-- No pricing is invented: credit_cost remains NULL until configured later.
insert into public.canvases(id,slug,title,description,width,height,status,canvas_type,stroke_limit,display_order)
values('22222222-2222-4222-8222-222222222222','million-dollar-canvas','Million Dollar Canvas',
  'One million strokes. One permanent artwork.',4000,3000,'open','flagship',1000000,-100);

-- Explicit public projection; underlying RLS applies to both tables.
create view public.canvas_catalog with(security_invoker=true) as
select c.id,c.slug,c.title,c.description,c.width,c.height,c.status,c.canvas_type,
  c.stroke_limit,c.credit_cost,c.display_order,c.opens_at,c.closes_at,u.approved_count
from public.canvases c join public.canvas_updates u on u.canvas_id=c.id;
revoke all on public.canvas_catalog from public,anon,authenticated;
grant select on public.canvas_catalog to anon,authenticated,service_role;
commit;
