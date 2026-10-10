CREATE TABLE public.recalls (
  id text PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL,
  product text NOT NULL DEFAULT '',
  firm text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  hazard text NOT NULL DEFAULT 'other',
  classification text,
  states text[] NOT NULL DEFAULT '{}',
  nationwide boolean NOT NULL DEFAULT false,
  lot_numbers text[] NOT NULL DEFAULT '{}',
  recall_date date NOT NULL,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recalls TO authenticated;
GRANT ALL ON public.recalls TO service_role;
ALTER TABLE public.recalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read recalls" ON public.recalls FOR SELECT TO authenticated USING (true);
CREATE INDEX recalls_date_idx ON public.recalls (recall_date DESC);
CREATE INDEX recalls_states_idx ON public.recalls USING gin (states);
ALTER PUBLICATION supabase_realtime ADD TABLE public.recalls;

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  recall_id text NOT NULL REFERENCES public.recalls(id) ON DELETE CASCADE,
  format text NOT NULL DEFAULT 'instagram',
  kind text NOT NULL DEFAULT 'image',
  headline text NOT NULL DEFAULT '',
  target_state text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own cards select" ON public.cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own cards insert" ON public.cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own cards update" ON public.cards FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own cards delete" ON public.cards FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_prefs (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  home_state text,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_prefs TO authenticated;
GRANT ALL ON public.user_prefs TO service_role;
ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own prefs select" ON public.user_prefs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own prefs insert" ON public.user_prefs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own prefs update" ON public.user_prefs FOR UPDATE TO authenticated USING (auth.uid() = user_id);