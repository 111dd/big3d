-- Supabase Database Setup for BIG 3D
-- הרץ את הקוד הזה ב-SQL Editor ב-Supabase Dashboard

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL, -- English key for JavaScript (e.g., 'egg', 'shark')
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create images table
CREATE TABLE IF NOT EXISTS images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_thumbnail BOOLEAN DEFAULT FALSE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Set up Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- 5. Policies for projects (read for everyone, write for authenticated)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read projects" ON projects;
DROP POLICY IF EXISTS "Only authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Only authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Only authenticated users can delete projects" ON projects;

CREATE POLICY "Anyone can read projects" ON projects
    FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert projects" ON projects
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update projects" ON projects
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete projects" ON projects
    FOR DELETE USING (auth.role() = 'authenticated');

-- 6. Policies for images (read for everyone, write for authenticated)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read images" ON images;
DROP POLICY IF EXISTS "Only authenticated users can insert images" ON images;
DROP POLICY IF EXISTS "Only authenticated users can update images" ON images;
DROP POLICY IF EXISTS "Only authenticated users can delete images" ON images;

CREATE POLICY "Anyone can read images" ON images
    FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert images" ON images
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update images" ON images
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete images" ON images
    FOR DELETE USING (auth.role() = 'authenticated');

-- 7. Storage policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete images" ON storage.objects;

CREATE POLICY "Anyone can view images" ON storage.objects
    FOR SELECT USING (bucket_id = 'project-images');

CREATE POLICY "Only authenticated users can upload images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'project-images' AND auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete images" ON storage.objects
    FOR DELETE USING (bucket_id = 'project-images' AND auth.role() = 'authenticated');

-- 8. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 9. Create trigger for updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Create site_logos table for managing website logos
CREATE TABLE IF NOT EXISTS site_logos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL, -- 'navbar', 'hero', 'general'
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Set up RLS for site_logos
ALTER TABLE site_logos ENABLE ROW LEVEL SECURITY;

-- 12. Policies for site_logos (read for everyone, write for authenticated)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read site logos" ON site_logos;
DROP POLICY IF EXISTS "Only authenticated users can insert site logos" ON site_logos;
DROP POLICY IF EXISTS "Only authenticated users can update site logos" ON site_logos;
DROP POLICY IF EXISTS "Only authenticated users can delete site logos" ON site_logos;

CREATE POLICY "Anyone can read site logos" ON site_logos
    FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert site logos" ON site_logos
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update site logos" ON site_logos
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete site logos" ON site_logos
    FOR DELETE USING (auth.role() = 'authenticated');

-- 13. Create trigger for site_logos updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_site_logos_updated_at ON site_logos;
CREATE TRIGGER update_site_logos_updated_at BEFORE UPDATE ON site_logos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Insert initial projects (optional - אם אתה רוצה להעביר את הפרויקטים הקיימים)
-- אתה יכול להריץ את זה אחרי שתעלה את התמונות ל-Storage
