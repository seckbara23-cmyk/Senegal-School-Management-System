-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  global_role TEXT DEFAULT 'user' CHECK (global_role IN ('user', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on schools
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Create school_memberships table
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('school_admin', 'teacher', 'finance_officer', 'parent', 'student')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, school_id, role)
);

-- Enable RLS on school_memberships
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;

-- Create students table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  admission_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  date_of_birth DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on students
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Create teachers table
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on teachers
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- Create parents table
CREATE TABLE IF NOT EXISTS public.parents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on parents
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

-- Create parent_student_links table
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  parent_id UUID REFERENCES public.parents(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT DEFAULT 'parent' CHECK (relationship IN ('father', 'mother', 'guardian', 'other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(parent_id, student_id)
);

-- Enable RLS on parent_student_links
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_school_memberships_user_id ON public.school_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_school_memberships_school_id ON public.school_memberships(school_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON public.teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_parents_school_id ON public.parents(school_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_school_id ON public.parent_student_links(school_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_parent_id ON public.parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_student_id ON public.parent_student_links(student_id);

-- RLS Policies

-- Profiles: Users can read/update their own profile, super_admin can read all
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admin can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Schools: All authenticated users can read schools they belong to, super_admin can read all
CREATE POLICY "Users can view schools they belong to" ON public.schools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = schools.id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "Super admin can manage all schools" ON public.schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- School memberships: Users can view their own memberships, school_admins can view memberships in their school, super_admin can view all
CREATE POLICY "Users can view own memberships" ON public.school_memberships
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "School admins can view memberships in their school" ON public.school_memberships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm
      WHERE sm.user_id = auth.uid() AND sm.school_id = school_memberships.school_id AND sm.role = 'school_admin'
    )
  );

CREATE POLICY "Super admin can view all memberships" ON public.school_memberships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage memberships in their school" ON public.school_memberships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm
      WHERE sm.user_id = auth.uid() AND sm.school_id = school_memberships.school_id AND sm.role = 'school_admin'
    )
  );

CREATE POLICY "Super admin can manage all memberships" ON public.school_memberships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Students: Users can view students in schools they belong to, with role-based access
CREATE POLICY "Users can view students in their schools" ON public.students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = students.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins and teachers can manage students in their school" ON public.students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = students.school_id AND role IN ('school_admin', 'teacher')
    )
  );

CREATE POLICY "Super admin can manage all students" ON public.students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Teachers: Similar to students
CREATE POLICY "Users can view teachers in their schools" ON public.teachers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = teachers.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage teachers in their school" ON public.teachers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = teachers.school_id AND role = 'school_admin'
    )
  );

CREATE POLICY "Super admin can manage all teachers" ON public.teachers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Parents: Similar
CREATE POLICY "Users can view parents in their schools" ON public.parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = parents.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage parents in their school" ON public.parents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = parents.school_id AND role = 'school_admin'
    )
  );

CREATE POLICY "Super admin can manage all parents" ON public.parents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Parent student links: Parents can view their own links, school staff can view in their school
CREATE POLICY "Parents can view their own links" ON public.parent_student_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = parent_student_links.parent_id AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can view links in their schools" ON public.parent_student_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = parent_student_links.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage links in their school" ON public.parent_student_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = parent_student_links.school_id AND role = 'school_admin'
    )
  );

CREATE POLICY "Super admin can manage all links" ON public.parent_student_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();