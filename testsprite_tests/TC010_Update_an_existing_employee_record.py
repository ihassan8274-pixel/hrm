import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:8090/")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'hr' demo account button, then click the 'login.signIn' button to sign in.
        # hr hr_manager button
        elem = page.get_by_role("button", name="hr hr_manager")
        await elem.click(timeout=10000)
        
        # -> Click the 'hr' demo account button, then click the 'login.signIn' button to sign in.
        # login.signIn button
        elem = page.get_by_role("button", name="login.signIn")
        await elem.click(timeout=10000)
        
        # -> Click the 'الموظفين والإقامات' (Employees & Visas) button in the HR menu to open the Employees screen.
        # الموظفين والإقامات button
        elem = page.get_by_role("button", name="الموظفين والإقامات")
        await elem.click(timeout=10000)
        
        # -> Click the 'إضافة موظف جديد' (Add new employee) button to open the new employee form.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Open the 'الجنسية' (Nationality) dropdown so a nationality option can be selected.
        # سعودي مصري هندي باكستاني يمني أردني سوري سوداني... dropdown
        elem = page.locator("div").filter(has_text=re.compile(r"^الجنسيةسعوديمصريهنديباكستانييمنيأردنيسوريسودانيفلبينيجنسية أخرى$")).get_by_role("combobox")
        await elem.click(timeout=10000)
        
        # -> Select 'مصري' from the 'الجنسية' (Nationality) dropdown to set the employee nationality.
        # سعودي مصري هندي باكستاني يمني أردني سوري سوداني... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Fill 'الاسم الكامل', 'رقم الهوية الوطنية / الإقامة', and 'المسمى الوظيفي الداخلي', then click the 'حفظ الموظف الجديد' (Save new employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Ahmed Test")
        
        # -> Fill 'الاسم الكامل', 'رقم الهوية الوطنية / الإقامة', and 'المسمى الوظيفي الداخلي', then click the 'حفظ الموظف الجديد' (Save new employee) button.
        # مثال: 1089234123 text field
        elem = page.get_by_role("textbox", name="مثال: 1089234123")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("1112223334")
        
        # -> Fill 'الاسم الكامل', 'رقم الهوية الوطنية / الإقامة', and 'المسمى الوظيفي الداخلي', then click the 'حفظ الموظف الجديد' (Save new employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("HR Specialist")
        
        # -> Fill 'الاسم الكامل', 'رقم الهوية الوطنية / الإقامة', and 'المسمى الوظيفي الداخلي', then click the 'حفظ الموظف الجديد' (Save new employee) button.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Select 'الفرع الرئيسي - الرياض' for Branch, select the HR Department option, set Contract Type to 'غير محدد المدة (مفتوح)', then click the 'حفظ الموظف الجديد' (Save new employee) button to attempt saving.
        # اختر الفرع... الفرع الرئيسي - الرياض فرع المنطقة... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[8]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'الفرع الرئيسي - الرياض' for Branch, select the HR Department option, set Contract Type to 'غير محدد المدة (مفتوح)', then click the 'حفظ الموظف الجديد' (Save new employee) button to attempt saving.
        # اختر الإدارة... الموارد البشرية والشؤون الحكومية... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[7]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'الفرع الرئيسي - الرياض' for Branch, select the HR Department option, set Contract Type to 'غير محدد المدة (مفتوح)', then click the 'حفظ الموظف الجديد' (Save new employee) button to attempt saving.
        # محدد المدة (سنوي) غير محدد المدة (مفتوح) مؤقت /... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[9]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'الفرع الرئيسي - الرياض' for Branch, select the HR Department option, set Contract Type to 'غير محدد المدة (مفتوح)', then click the 'حفظ الموظف الجديد' (Save new employee) button to attempt saving.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'تعديل' (Edit) button for Ahmed Test to open the employee edit form.
        # تعديل button
        elem = page.get_by_role("button", name="تعديل", exact=True)
        await elem.click(timeout=10000)
        
        # -> Set the employee full name to 'Ahmed Test Edited' and click the 'تحديث وحفظ البيانات' (Update & Save) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Ahmed Test Edited")
        
        # -> Set the employee full name to 'Ahmed Test Edited' and click the 'تحديث وحفظ البيانات' (Update & Save) button.
        # تحديث وحفظ البيانات button
        elem = page.get_by_role("button", name="تحديث وحفظ البيانات")
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The employees register shows the updated employee name 'Ahmed Test Edited' with national ID '1112223334'.
        # Assert-outcome: passed
        # Assert: Verify the employee row contains the updated full name 'Ahmed Test Edited'.
        await expect(page.locator("tbody").nth(0)).to_contain_text("Ahmed Test Edited", timeout=15000), "Verify the employee row contains the updated full name 'Ahmed Test Edited'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    