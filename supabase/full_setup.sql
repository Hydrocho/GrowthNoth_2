-- ==========================================================================
-- Growth Note - 통합 데이터베이스 초기 세팅 스크립트
-- ==========================================================================
-- 이 파일은 새 Supabase 프로젝트를 세팅할 때 한 번에 실행하기 위한 합본입니다.
-- 원본 파일 (schema.sql + migrations/) 은 그대로 보존되어 있습니다.
--
-- 포함된 원본 파일 목록 (적용 순서):
--   1. supabase/schema.sql                    (기본 테이블 + RLS 기초 정책)
--   2. 20260705000000_add_daily_pet_draws.sql  (일일 펫 뽑기 테이블)
--   3. 20260705111100_enable_realtime_students  (Realtime 활성화)
--   4. 20260705122200_allow_student_delete_data (학생 데이터 삭제 정책)
--   5. 20260705133300_teacher_roles_and_rls_hardening (교사 역할 + RLS 고도화)
--
-- 주의: 이 스크립트는 기존 정책명 충돌을 방지하기 위해
--       drop policy if exists ... 를 선행한 뒤 create policy 를 실행합니다.
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- PART 1: 확장 기능 및 테이블 생성
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- 학생 테이블
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id text not null unique,
  name text,
  nickname text,
  pin text not null,
  total_xp integer not null default 0,
  level integer not null default 1,
  current_avatar_num text default '1_001',
  current_pet_num text default '000',
  display_avatar_type text not null default 'level',
  created_at timestamptz not null default now()
);

-- 획득 아바타 테이블
create table if not exists public.unlocked_avatars (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  avatar_id text not null,
  gender text not null default '1',
  quantity integer not null default 1,
  unlocked_at timestamptz not null default now(),
  unique (student_id, avatar_id, gender)
);

-- 획득 마이펫 테이블
create table if not exists public.unlocked_pets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  pet_id text not null,
  quantity integer not null default 1,
  unlocked_at timestamptz not null default now(),
  unique (student_id, pet_id)
);

-- 일일 펫 뽑기 기록 테이블
create table if not exists public.daily_pet_draws (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  draw_date date not null,
  pet_id text,
  created_at timestamptz not null default now(),
  unique (student_id, draw_date)
);

-- 학생 활동 로그 테이블
create table if not exists public.student_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  type text not null,
  category text not null,
  description text,
  xp_change integer not null default 0,
  reward_type text,
  reward_id text,
  level_before integer,
  level_after integer,
  created_at timestamptz not null default now()
);

-- 교사 권한 매핑 테이블
create table if not exists public.teacher_roles (
  email text primary key,
  role text not null check (role in ('admin', 'praise_only')),
  created_at timestamptz not null default now()
);


-- ══════════════════════════════════════════════════════════════════════════
-- PART 2: RLS 활성화
-- ══════════════════════════════════════════════════════════════════════════

alter table public.students enable row level security;
alter table public.unlocked_avatars enable row level security;
alter table public.unlocked_pets enable row level security;
alter table public.daily_pet_draws enable row level security;
alter table public.student_logs enable row level security;
alter table public.teacher_roles enable row level security;


-- ══════════════════════════════════════════════════════════════════════════
-- PART 3: 교사 권한 판별 헬퍼 함수
-- ══════════════════════════════════════════════════════════════════════════

-- 최고 관리자 교사 판별 (Security Definer로 RLS 재귀 방지)
create or replace function public.is_admin_teacher()
returns boolean security definer set search_path = public as $$
begin
  return (
    auth.role() = 'authenticated' and
    exists (
      select 1 from public.teacher_roles
      where email = auth.jwt() ->> 'email'
      and role = 'admin'
    )
  );
end;
$$ language plpgsql;

-- 칭찬전용 교사 판별
create or replace function public.is_praise_only_teacher()
returns boolean security definer set search_path = public as $$
begin
  return (
    auth.role() = 'authenticated' and
    exists (
      select 1 from public.teacher_roles
      where email = auth.jwt() ->> 'email'
      and role = 'praise_only'
    )
  );
end;
$$ language plpgsql;


-- ══════════════════════════════════════════════════════════════════════════
-- PART 4: RLS 정책 (최종 고도화 버전)
-- ══════════════════════════════════════════════════════════════════════════

-- ---- students 테이블 ----
drop policy if exists "anon read students" on public.students;
drop policy if exists "allow select students" on public.students;
create policy "allow select students" on public.students
  for select using (
    auth.role() = 'anon' or
    public.is_admin_teacher() or
    public.is_praise_only_teacher()
  );

drop policy if exists "anon insert students" on public.students;
drop policy if exists "allow insert students" on public.students;
create policy "allow insert students" on public.students
  for insert with check (auth.role() = 'anon' or public.is_admin_teacher());

drop policy if exists "anon update students" on public.students;
create policy "anon update students" on public.students
  for update using (true) with check (true);

drop policy if exists "anon delete students" on public.students;
drop policy if exists "allow delete students" on public.students;
create policy "allow delete students" on public.students
  for delete using (public.is_admin_teacher());

-- ---- unlocked_avatars 테이블 ----
drop policy if exists "anon read avatars" on public.unlocked_avatars;
create policy "anon read avatars" on public.unlocked_avatars for select using (true);

drop policy if exists "anon insert avatars" on public.unlocked_avatars;
create policy "anon insert avatars" on public.unlocked_avatars for insert with check (true);

drop policy if exists "anon delete avatars" on public.unlocked_avatars;
create policy "anon delete avatars" on public.unlocked_avatars for delete using (true);

-- ---- unlocked_pets 테이블 ----
drop policy if exists "anon read pets" on public.unlocked_pets;
create policy "anon read pets" on public.unlocked_pets for select using (true);

drop policy if exists "anon insert pets" on public.unlocked_pets;
create policy "anon insert pets" on public.unlocked_pets for insert with check (true);

drop policy if exists "anon delete pets" on public.unlocked_pets;
create policy "anon delete pets" on public.unlocked_pets for delete using (true);

-- ---- daily_pet_draws 테이블 ----
drop policy if exists "anon read daily pet draws" on public.daily_pet_draws;
create policy "anon read daily pet draws" on public.daily_pet_draws for select using (true);

drop policy if exists "anon insert daily pet draws" on public.daily_pet_draws;
create policy "anon insert daily pet draws" on public.daily_pet_draws for insert with check (true);

drop policy if exists "anon delete daily pet draws" on public.daily_pet_draws;
create policy "anon delete daily pet draws" on public.daily_pet_draws for delete using (true);

-- ---- student_logs 테이블 ----
drop policy if exists "anon read logs" on public.student_logs;
create policy "anon read logs" on public.student_logs for select using (true);

drop policy if exists "anon insert logs" on public.student_logs;
create policy "anon insert logs" on public.student_logs for insert with check (true);

drop policy if exists "anon delete logs" on public.student_logs;
create policy "anon delete logs" on public.student_logs for delete using (true);

-- ---- teacher_roles 테이블 ----
drop policy if exists "admin manage teacher roles" on public.teacher_roles;
create policy "admin manage teacher roles" on public.teacher_roles
  for all using (public.is_admin_teacher()) with check (public.is_admin_teacher());

drop policy if exists "authenticated read teacher roles" on public.teacher_roles;
create policy "authenticated read teacher roles" on public.teacher_roles
  for select using (auth.role() = 'authenticated');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 5: 트리거 함수 및 트리거
-- ══════════════════════════════════════════════════════════════════════════

-- 학생 테이블 민감 정보 수정 방어 트리거
create or replace function public.check_student_update_permissions()
returns trigger as $$
begin
  -- 최고 관리자 교사는 모든 수정 가능
  if public.is_admin_teacher() then
    return new;
  end if;

  -- 칭찬전용 교사 또는 학생 본인이 아닌 미승인 계정은 모든 업데이트 불가능
  if not (public.is_praise_only_teacher() or auth.role() = 'anon') then
    raise exception '수정 권한이 없습니다. 최고 관리자 계정이 아닙니다.';
  end if;

  -- 칭찬전용 교사 및 학생 본인은 학번, 이름, PIN을 임의 수정 불가능
  if new.school_id <> old.school_id then
    raise exception '학번(school_id) 정보는 최고 관리자만 수정할 수 있습니다.';
  end if;

  if new.name is distinct from old.name then
    raise exception '이름(name) 정보는 최고 관리자만 수정할 수 있습니다.';
  end if;

  if new.pin <> old.pin then
    raise exception '비밀번호 PIN은 최고 관리자만 수정할 수 있습니다.';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_student_update_permissions on public.students;
create trigger enforce_student_update_permissions
  before update on public.students
  for each row
  execute function public.check_student_update_permissions();

-- 첫 번째 교사 가입 시 자동 admin 등록 트리거
create or replace function public.handle_first_teacher_signup()
returns trigger as $$
declare
  has_roles boolean;
begin
  select exists(select 1 from public.teacher_roles) into has_roles;

  if not has_roles then
    insert into public.teacher_roles (email, role)
    values (new.email, 'admin');
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_first_teacher_signup();

-- 가입했으나 역할 미지정 교사 대기 목록 반환 함수 (RPC)
create or replace function public.get_pending_teachers()
returns table (id uuid, email text, created_at timestamptz)
security definer set search_path = public, auth as $$
begin
  if not public.is_admin_teacher() then
    raise exception '권한이 없습니다. 최고 관리자 계정이 아닙니다.';
  end if;

  return query
  select u.id, u.email::text, u.created_at
  from auth.users u
  where not exists (
    select 1 from public.teacher_roles r
    where lower(r.email) = lower(u.email)
  )
  order by u.created_at desc;
end;
$$ language plpgsql;


-- ══════════════════════════════════════════════════════════════════════════
-- PART 6: Realtime 활성화
-- ══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table public.students;


-- ==========================================================================
-- 초기 세팅 완료!
-- ==========================================================================
