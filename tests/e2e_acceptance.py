"""
End-to-end acceptance test: the CMS scenarios from ТЗ §14, run in a real browser.
Usage: python3 tests/e2e_acceptance.py [base_url] [admin_email] [admin_password]
Requires: playwright (python), Pillow. Uses a fresh database.
"""
import asyncio, sys, os, re, time, tempfile
from playwright.async_api import async_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
EMAIL = sys.argv[2] if len(sys.argv) > 2 else 'admin@cartel.ua'
PW = sys.argv[3] if len(sys.argv) > 3 else 'TestAdmin12345'
NEWPW = 'NewSecret2026x'
A = BASE + '/admin'
TMP = tempfile.mkdtemp()
results = []

def ok(name):
    results.append(('OK', name)); print('  ✔', name)

def make_assets():
    from PIL import Image, ImageDraw
    paths = {}
    for n, color in [('hero', (40, 70, 60)), ('brand', (120, 90, 60)), ('event', (90, 30, 40)), ('project', (30, 50, 90))]:
        im = Image.new('RGB', (1800, 1100), color)
        d = ImageDraw.Draw(im); d.rectangle([200, 200, 1600, 900], outline=(240, 240, 230), width=12)
        p = os.path.join(TMP, f'{n}.jpg'); im.save(p, quality=85); paths[n] = p
    pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 300 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
    paths['cv'] = os.path.join(TMP, 'cv.pdf'); open(paths['cv'], 'wb').write(pdf)
    paths['fake'] = os.path.join(TMP, 'evil.pdf'); open(paths['fake'], 'wb').write(b'<script>alert(1)</script>')
    return paths

async def upload_in_picker(page, file):
    """Inside an open media picker: upload a file — single pick closes the modal automatically."""
    modal = page.locator('.modal')
    await expect(modal).to_be_visible()
    await modal.locator('input[type=file]').set_input_files(file)
    await expect(modal).to_be_hidden(timeout=30000)

async def save_publish(page):
    await page.click('[data-publish]')
    await expect(page.locator('.toast')).to_contain_text('Опубліковано', timeout=15000)

async def main():
    assets = make_assets()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1400, 'height': 1000}, locale='uk-UA')
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))

        # ---- login + forced password change ----
        await page.goto(A)
        await page.fill('input[name=email]', EMAIL)
        await page.fill('input[name=password]', PW)
        await page.click('button[type=submit]')
        await expect(page.locator('h1')).to_contain_text('Мій профіль')
        await page.fill('input[name=current]', PW)
        await page.fill('input[name=password]', NEWPW)
        await page.fill('input[name=password2]', NEWPW)
        await page.click('form[action$="/account/password"] button')
        await expect(page.locator('.flash--ok')).to_contain_text('Пароль змінено')
        ok('Вхід адміністратора і примусова зміна пароля')

        # ---- 1. create & edit a brand page ----
        await page.goto(A + '/c/brand')
        await page.click('text=Додати бренд')
        await page.wait_for_selector('#editor .fld')
        await page.get_by_label('Назва', exact=True).first.fill('Test Bistro')
        await page.locator('select').first.select_option('restaurant')
        await page.get_by_label('Короткий опис для картки', exact=True).fill('Тестовий заклад для приймання.')
        await page.locator('.fld', has_text='Головне фото (Hero)').get_by_role('button', name='Обрати фото').click()
        await upload_in_picker(page, assets['brand'])
        await page.locator('summary', has_text='Контакти').click()
        await page.locator('.fld', has_text='Телефони').get_by_role('button', name=re.compile('Додати')).click()
        await page.locator('.fld', has_text='Телефони').locator('input').first.fill('+38 (067) 111-22-33')
        await save_publish(page)
        slug = await page.locator('.slugrow input').input_value()
        r = await page.goto(f'{BASE}/brands/{slug}')
        assert r.status == 200, r.status
        await expect(page.locator('h1')).to_contain_text('Test Bistro')
        await expect(page.locator('a[href="tel:+380671112233"]').first).to_be_visible()
        ok(f'Створення сторінки бренду /brands/{slug} з фото і телефоном')

        # the brand automatically appears in Contacts (single source of data)
        await page.goto(BASE + '/contacts')
        await expect(page.locator('#directory')).to_contain_text('Test Bistro')
        ok('Бренд автоматично зʼявився у списку обʼєктів на сторінці «Контакти»')

        # ---- 2. change company contacts ----
        await page.goto(A + '/settings/company')
        await page.wait_for_selector('#editor .item')
        await page.locator('.item').first.locator('.item__head').click()
        num = page.locator('.item').first.get_by_label('Номер', exact=True)
        await num.fill('+38 (067) 999-00-11')
        await page.click('[data-save-settings]')
        await expect(page.locator('.toast')).to_contain_text('Збережено')
        await page.goto(BASE + '/')
        await expect(page.locator('footer')).to_contain_text('+38 (067) 999-00-11')
        ok('Зміна контактів компанії → оновився футер')

        # ---- 3. add investment project & move sections ----
        await page.goto(A + '/c/project')
        await page.click('text=Додати проєкт')
        await page.wait_for_selector('#editor .fld')
        await page.get_by_label('Назва', exact=True).first.fill('Carpathian Lodge')
        await page.get_by_label('Офіційний сайт проєкту', exact=True).fill('https://example.com/lodge')
        await page.locator('.fld', has_text='Велике фото').get_by_role('button', name='Обрати фото').click()
        await upload_in_picker(page, assets['project'])
        await save_publish(page)
        await page.goto(A + '/c/page')
        await page.click('.row__main:has-text("Інвестиції")')
        await page.wait_for_selector('.blk')
        # unhide the "all projects" block and move it above the text block
        last = page.locator('.blk').last
        await last.locator('[title="Показати блок на сайті"]').click()
        for _ in range(2):
            await page.locator('.blk', has_text='Список інвестиційних').locator('[aria-label="Вище"]').click()
        titles = await page.locator('.blk__title').all_inner_texts()
        assert 'Список інвестиційних' in titles[1], titles
        await save_publish(page)
        await page.goto(BASE + '/investments')
        html = await page.content()
        assert html.index('Carpathian Lodge') < html.index('Інвестуйте разом з CARTEL'), 'order not applied'
        await expect(page.locator('a[href="https://example.com/lodge"]').first).to_be_visible()
        ok('Додано інвестиційний проєкт, блок переміщено й показано на сторінці')

        # ---- 4. replace media on Home + 5. edit EN version ----
        await page.goto(A + '/c/page')
        await page.click('.row__main:has-text("Головна")')
        await page.wait_for_selector('.blk')
        hero = page.locator('.blk').first
        await hero.locator('.blk__head').click()
        await hero.locator('.fld', has_text='Фото (також').get_by_role('button', name='Замінити').click()
        await upload_in_picker(page, assets['hero'])
        await page.click('[data-lang-switch] button[data-l="en"]')
        await hero.locator('.fld', has_text='Заголовок').locator('[data-lang="en"] input').fill('Hospitality, redefined in the Carpathians')
        await save_publish(page)
        await page.goto(BASE + '/en')
        await expect(page.locator('h1')).to_have_text('Hospitality, redefined in the Carpathians')
        await page.goto(BASE + '/')
        await expect(page.locator('h1')).to_have_text('Новий рівень відпочинку в Україні')
        ok('Заміна фото в Hero на Home і редагування англійської версії (UA не змінилась)')

        # ---- 6. add an event to About ----
        await page.goto(A + '/c/event')
        await page.click('.row__main:has-text("Виступ Тіни Кароль")')
        await page.wait_for_selector('#editor .fld')
        await page.get_by_label('Дата / рік', exact=True).fill('Лютий 2025')
        await page.get_by_label('Короткий підпис', exact=True).fill('Сольний вечір у VERANDA.')
        await page.locator('.fld', has_text='Головне фото').get_by_role('button', name='Обрати фото').click()
        await upload_in_picker(page, assets['event'])
        await save_publish(page)
        await page.goto(BASE + '/about')
        await expect(page.locator('#events')).to_contain_text('Виступ Тіни Кароль')
        ok('Додано подію в Signature Events на сторінці About')

        # ---- preview of a draft & history restore ----
        await page.goto(A + '/c/page')
        await page.click('.row__main:has-text("Про компанію")')
        await page.wait_for_selector('.blk')
        b0 = page.locator('.blk').first
        await b0.locator('.blk__head').click()
        await b0.locator('.fld', has_text='Заголовок').locator('[data-lang="uk"] input').fill('ЧЕРНЕТКА-ЗАГОЛОВОК')
        await page.click('[data-save]')
        await expect(page.locator('.toast')).to_contain_text('Збережено')
        pv = await ctx.new_page(); await pv.goto(BASE + '/about?preview=1')
        await expect(pv.locator('h1')).to_have_text('ЧЕРНЕТКА-ЗАГОЛОВОК'); await pv.close()
        anon = await b.new_context(); ap = await anon.new_page(); await ap.goto(BASE + '/about?preview=1')
        await expect(ap.locator('h1')).not_to_have_text('ЧЕРНЕТКА-ЗАГОЛОВОК'); await anon.close()
        ok('Попередній перегляд чернетки бачить лише редактор, відвідувач — опубліковану версію')
        await page.goto(page.url + '/history')
        await page.locator('form[action*="/restore/"] button').first.click()
        await expect(page.locator('.flash--ok')).to_contain_text('відновлено')
        await page.wait_for_selector('.blk')
        val = await page.locator('.blk').first.locator('[data-lang="uk"] input').first.input_value()
        assert val != 'ЧЕРНЕТКА-ЗАГОЛОВОК', val
        ok('Відновлення попередньої версії з історії змін')

        # ---- create HR user ----
        await page.goto(A + '/users')
        await page.click('summary:has-text("Додати користувача")')
        await page.fill('input[name=name]', 'Олена HR')
        await page.fill('input[name=email]', 'hr@test.ua')
        await page.select_option('select[name=role]', 'hr')
        await page.click('form.inline-form button')
        temp = (await page.locator('code.copy').inner_text()).strip()
        ok('Адміністратор створив користувача з роллю HR')

        # ---- 7. HR: publish a vacancy ----
        hr = await b.new_context(viewport={'width': 1400, 'height': 1000})
        hp = await hr.new_page()
        hp.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await hp.goto(A + '/login')
        await hp.fill('input[name=email]', 'hr@test.ua'); await hp.fill('input[name=password]', temp); await hp.click('button[type=submit]')
        await hp.fill('input[name=current]', temp); await hp.fill('input[name=password]', 'HrSecret2026x'); await hp.fill('input[name=password2]', 'HrSecret2026x')
        await hp.click('form[action$="/account/password"] button')
        r = await hp.goto(A + '/c/brand'); assert r.status == 403, 'HR must not edit brands'
        r = await hp.goto(A + '/settings/company'); assert r.status == 403
        ok('HR не має доступу до брендів і налаштувань')
        await hp.goto(A + '/c/vacancy')
        await hp.click('.row__main:has-text("Офіціант / офіціантка")')
        await hp.wait_for_selector('#editor .fld')
        await hp.get_by_label('Короткий опис', exact=True).fill('Шукаємо уважного офіціанта в TEPPAN.')
        await hp.get_by_label('Оплата', exact=True).fill('від 25 000 грн')
        await save_publish(hp)
        await hp.goto(BASE + '/vacancies')
        await expect(hp.locator('.jobs')).to_contain_text('Офіціант')
        ok('HR опублікував вакансію — вона на сторінці «Вакансії»')

        # ---- 8. candidate applies with CV ----
        cand = await b.new_context(); cp = await cand.new_page()
        await cp.goto(BASE + '/vacancies/oficiant')
        await cp.wait_for_timeout(3300)  # anti-bot timing token requires ≥3 s
        form = cp.locator('.job-page__aside form')
        await form.locator('input[name=name]').fill('Іван Кандидат')
        await form.locator('input[name=phone]').fill('+380 67 123 45 67')
        await form.locator('input[name=cv]').set_input_files(assets['fake'])
        await form.locator('input[name=consent]').check()
        await form.locator('button[type=submit]').click()
        await expect(form.locator('[data-field=cv] .field__error')).to_be_visible()
        ok('Підроблений файл під виглядом PDF відхилено')
        await form.locator('input[name=cv]').set_input_files(assets['cv'])
        await form.locator('button[type=submit]').click()
        await expect(form.locator('.form-result')).to_be_visible(timeout=15000)
        ok('Кандидат відгукнувся з резюме — показано підтвердження')
        await cand.close()

        # ---- 9. HR sees the application and opens the CV ----
        await hp.goto(A + '/applications')
        await hp.click('text=Іван Кандидат')
        await expect(hp.locator('.kv')).to_contain_text('Офіціант')
        cv = await hp.request.get(hp.url + '/cv')
        assert cv.status == 200 and cv.headers['content-type'].startswith('application/pdf')
        ok('HR переглядає заявку і вкладений файл резюме')

        # ---- 10. close the vacancy ----
        await hp.goto(A + '/c/vacancy')
        await hp.click('button:has-text("Деактивувати")')
        await expect(hp.locator('.flash--ok')).to_contain_text('деактивовано')
        await hp.goto(BASE + '/vacancies')
        assert 'Офіціант' not in await hp.locator('#vacancies').inner_text()
        r = await hp.goto(BASE + '/vacancies/oficiant')
        assert '/vacancies' in hp.url
        await hp.goto(A + '/applications')
        await expect(hp.locator('table')).to_contain_text('Іван Кандидат')
        ok('Вакансію закрито: зникла з сайту, відгук збережено')
        await hr.close()

        # ---- cooperation form ----
        cc = await b.new_context(); pp = await cc.new_page()
        await pp.goto(BASE + '/cooperation'); await pp.wait_for_timeout(3300)
        f = pp.locator('form[data-form]')
        await f.locator('input[value=creators]').check()
        await f.locator('input[name=name]').fill('Марта'); await f.locator('input[name=company]').fill('@marta.travel')
        await f.locator('input[name=contact]').fill('marta@example.com'); await f.locator('textarea[name=proposal]').fill('Тревел-контент про Буковель')
        await f.locator('input[name=consent]').check(); await f.locator('button[type=submit]').click()
        await expect(f.locator('.form-result')).to_be_visible(timeout=15000)
        await cc.close()
        await page.goto(A + '/submissions')
        await expect(page.locator('table')).to_contain_text('Марта')
        ok('Форма співпраці: заявка надіслана й видна маркетингу в CMS')

        assert not errors, errors
        ok('Без JS-помилок у браузері')
        await b.close()
    print(f'\n{len(results)} перевірок пройдено.')

asyncio.run(main())
