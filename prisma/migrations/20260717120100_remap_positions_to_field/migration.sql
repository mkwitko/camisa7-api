-- Remap the legacy 6-position vocabulary (goleiro|zagueiro|lateral|volante|
-- meia|atacante) to the modality-scoped `campo_*` vocabulary in the
-- JSON position maps: Player.affinity, GroupMember.affinity, PlayerCareer.overall.
-- `lateral` and `zagueiro` both collapse onto `campo_lateral` (GREATEST wins).
-- Keys not in the legacy set (already-migrated slugs) pass through unchanged.
-- (`GroupMember.primaryPos`/`secondaryPos`/`seedOverall` stay on the legacy
-- `Position` enum — out of scope, deliberately untouched.)
DO $$
DECLARE
  tc text[];
  tbl_col text[][] := ARRAY[
    ['"Player"', 'affinity'],
    ['"GroupMember"', 'affinity'],
    ['"PlayerCareer"', 'overall']
  ];
BEGIN
  FOREACH tc SLICE 1 IN ARRAY tbl_col LOOP
    EXECUTE format($f$
      UPDATE %1$s SET %2$I = (
        SELECT COALESCE(jsonb_object_agg(k2, v2), '{}'::jsonb) FROM (
          SELECT
            CASE key
              WHEN 'goleiro'  THEN 'campo_goleiro'
              WHEN 'zagueiro' THEN 'campo_lateral'
              WHEN 'lateral'  THEN 'campo_lateral'
              WHEN 'volante'  THEN 'campo_ala_volante'
              WHEN 'meia'     THEN 'campo_meia'
              WHEN 'atacante' THEN 'campo_atacante'
              ELSE key
            END AS k2,
            MAX((value)::numeric) AS v2
          FROM jsonb_each_text(%2$I::jsonb)
          GROUP BY 1
        ) s
      )::jsonb
      WHERE %2$I IS NOT NULL AND %2$I::text <> '{}';
    $f$, tc[1], tc[2]);
  END LOOP;
END $$;
