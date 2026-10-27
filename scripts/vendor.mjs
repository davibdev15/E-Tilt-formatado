import { copyFile } from 'node:fs/promises';
export async function build() {
  await copyFile(
    'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
    'public/vendor/supabase.js',
  );
}
