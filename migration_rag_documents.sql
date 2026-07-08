-- Create rag_documents table
create table if not exists rag_documents (
  id uuid default gen_random_uuid() primary key,
  filename text not null,
  file_size integer not null,
  file_type text not null,
  file_path text, -- can store extracted text or local reference path
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table rag_documents enable row level security;

-- Create policy for authenticated users (read/write)
create policy "Allow all operations for authenticated staff/admin" on rag_documents
  for all to authenticated
  using (true)
  with check (true);
