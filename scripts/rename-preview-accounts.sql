-- Local development cleanup: only known fixture display names are changed.
WITH candidates AS (
 SELECT id, display_name, row_number() OVER (ORDER BY id)-1 AS n
 FROM users WHERE display_name IN ('Smoke Test Author','Smoke Test Approver','Smoke Test Recipient','Community Test User','Messaging Test User','Test User','CORS Test')
), names AS (
 SELECT id, CASE display_name
 WHEN 'Smoke Test Author' THEN 'Kwame Asante'
 WHEN 'Smoke Test Approver' THEN 'Abena Osei'
 WHEN 'Smoke Test Recipient' THEN 'Kofi Mensah'
 ELSE (ARRAY['Ama','Daniel','Nana','Sarah','Emmanuel','Akosua','Michael','Efua','David','Adwoa','Samuel','Grace','Joseph','Esi','Isaac','Naomi','Benjamin','Lydia','Nathan','Ruth'])[1+(n%20)::int] || ' ' || (ARRAY['Boateng','Mensah','Owusu','Asante','Osei','Adjei','Agyeman','Addo','Appiah','Darko','Bonsu','Amoah','Frimpong','Nyarko','Opoku','Sarpong','Acheampong','Danso','Antwi','Amponsah'])[1+((n/20)%20)::int] END AS name
 FROM candidates
)
UPDATE users SET display_name=names.name, updated_at=now(), version=version+1 FROM names WHERE users.id=names.id;
