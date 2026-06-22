-- Restore data from localStorage (memo_v2) → Supabase
-- Run in: Supabase Dashboard → SQL Editor → Run
-- User: hej@flaminjoe.studio (7b9d9703-589f-4d52-897f-d1bad1f074ea)
-- Generated: 2026-06-04

-- NOTES
INSERT INTO public.notes (user_id, title, body, folder, tags, pinned, created_at, updated_at) VALUES
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Zmiana nazwy firmy z Flamin Joe Studio na Studio Dialog, Dia', 'Zmiana nazwy firmy z Flamin Joe Studio na Studio Dialog, Dialog lub Dialog Studio.', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1780050652876/1000.0), to_timestamp(1780050652876/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Pomysł na aplikację: Przewodnik dla ojców jak czesać córki.', 'Pomysł na aplikację: Przewodnik dla ojców jak czesać córki. Krok po kroku, zdjęcia, może nawet podpowiedzi z AI na podstawie zdjęć. Różne fryzury, stopnie trudności, zdobywanie poziomów doświadczenia - gamification.', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1780044418226/1000.0), to_timestamp(1780044418226/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Memo: Zakładki u góry powinny być wyraźniej od siebie oddzielone.', 'Memo: Zakładki u góry powinny być wyraźniej od siebie oddzielone.', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1779355874360/1000.0), to_timestamp(1779355874360/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Memo: przełączenie na zakładkę To-Do u góry', 'Memo: przełączenie na zakładkę To-Do u góry powinno też przełączać na To-do na dole, aby można było dodawać kolejne zadania bez dodatkowego przeklikiwania.', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1779355854813/1000.0), to_timestamp(1779355854813/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Wysłać Jankowi pliki logo', 'Wysłać Jankowi pliki logo', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1779266006831/1000.0), to_timestamp(1779266006831/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Memo: Możliwość edycji notatek', 'Memo: Możliwość edycji notatek', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1779265979158/1000.0), to_timestamp(1779265979158/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Memo: wybór daty dzisiaj przy dodawaniu rzeczy do zrobienia', E'Memo: wybór daty "dzisiaj" przy dodawaniu rzeczy do zrobienia,\nscroll bar po prawej widoczny przy dłuższych wiadomościach podczas dodawania notatki', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1779265960557/1000.0), to_timestamp(1779265960557/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Musimy wykminić jak zrobić ze mnie konsultanta', 'Musimy wykminić jak zrobić ze mnie konsultanta, który pracuje jako niezależna osoba, ale ma też podwykonawców lub wykonuje zadania sam. Myślę tutaj głównie o wprowadzaniu podstawowych marketingowych konceptów do firm, które nie mają o tym zielonego pojęcia. Dla przykładu dzisiaj na etacie rozmawiałem z właścicielką małego hotelu w Koszalinie i podpowiedziałem jej, że powinna zadbać o dodawanie regularnie postów na facebooku i instagramie. niby oczywistość, ale oni tego nie robili i dlatego tracili gości, dla których wizerunek hotelu online ma znaczenie dla wyboru. Do zaplanowania, wybadania i realizacji.', 'inbox', ARRAY['inbox']::text[], false, to_timestamp(1776710039403/1000.0), to_timestamp(1776710039403/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Look into body doubling for focus', 'Read something about body doubling helping with ADHD task initiation. Check out Focusmate — virtual co-working sessions that might help with deep work.', 'personal', ARRAY['personal', 'adhd']::text[], false, to_timestamp(1776623025015/1000.0), to_timestamp(1776623025015/1000.0));

-- TODOS
INSERT INTO public.todos (user_id, text, done, due, created_at, updated_at) VALUES
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'kaski z nadrukiem sklep interentowy', false, NULL, to_timestamp(1780490115891/1000.0), to_timestamp(1780490115891/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'sklep dropshipping z KASKAMI - OBOWIĄZEK DAL DZIECI <16 LAT.', true, NULL, to_timestamp(1780472209564/1000.0), to_timestamp(1780472209564/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Linkedin zautomatyzować tworzenie treści', false, NULL, to_timestamp(1780471383713/1000.0), to_timestamp(1780471383713/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Zaproszenia na ślub wypuścić w świat', false, NULL, to_timestamp(1780471096760/1000.0), to_timestamp(1780471096760/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Oferta dla Patryka: A4 wydrukowana dla warsztatów, osobno dla sklepów motoryzacyjnych.', false, NULL, to_timestamp(1780471083290/1000.0), to_timestamp(1780471083290/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Grafika GFL z cytatem', true, NULL, to_timestamp(1780427320253/1000.0), to_timestamp(1780427320253/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'weryfikacja profilu apple business: 1 krok - wpis dns - zalatwiony. 2 krok: dokument.', true, NULL, to_timestamp(1779389570762/1000.0), to_timestamp(1779389570762/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Szymon ma zadzwonić', true, NULL, to_timestamp(1779355777935/1000.0), to_timestamp(1779355777935/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Kolejny krok SEO drjanlos.pl', true, NULL, to_timestamp(1779266113148/1000.0), to_timestamp(1779266113148/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Opłacić Mamie ubezpieczenie', true, NULL, to_timestamp(1779266107089/1000.0), to_timestamp(1779266107089/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Wysłać Jankowi pliki logo', true, NULL, to_timestamp(1779266021436/1000.0), to_timestamp(1779266021436/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Odpisać Szymonowi', true, NULL, to_timestamp(1779265873975/1000.0), to_timestamp(1779265873975/1000.0)),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Uzupełnić stronę Janka', false, '2026-05-21T14:00:00+00:00', to_timestamp(1779265848175/1000.0), to_timestamp(1779265848175/1000.0));

-- REMINDERS (oba notified=true — nie odpali ich ponownie)
INSERT INTO public.reminders (user_id, text, time, notified, created_at) VALUES
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Check email for client reply', '2026-04-20T19:23:45.015Z', true, '2026-04-20T19:23:45.015Z'),
('7b9d9703-589f-4d52-897f-d1bad1f074ea', 'Take a proper break', '2026-04-20T21:23:45.015Z', true, '2026-04-20T21:23:45.015Z');
