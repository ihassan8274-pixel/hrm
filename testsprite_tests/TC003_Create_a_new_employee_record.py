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
        
        # -> Click the 'hr' demo account button to select HR credentials, then click the 'login.signin' button to sign in.
        # hr hr_manager button
        elem = page.get_by_role("button", name="hr hr_manager")
        await elem.click(timeout=10000)
        
        # -> Click the 'hr' demo account button to select HR credentials, then click the 'login.signin' button to sign in.
        # login.signIn button
        elem = page.get_by_role("button", name="login.signIn")
        await elem.click(timeout=10000)
        
        # -> Open the Employees screen by clicking the 'الموظفين والإقامات' navigation button.
        # الموظفين والإقامات button
        elem = page.get_by_role("button", name="الموظفين والإقامات")
        await elem.click(timeout=10000)
        
        # -> Click the 'إضافة موظف جديد' button to open the Add Employee form.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Fill the full name, ID number, and internal job title fields and click the 'حفظ الموظف الجديد' (Save new employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Test Employee")
        
        # -> Fill the full name, ID number, and internal job title fields and click the 'حفظ الموظف الجديد' (Save new employee) button.
        # مثال: 1089234123 text field
        elem = page.get_by_role("textbox", name="مثال: 1089234123")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("1089234123")
        
        # -> Fill the full name, ID number, and internal job title fields and click the 'حفظ الموظف الجديد' (Save new employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("HR Assistant")
        
        # -> Fill the full name, ID number, and internal job title fields and click the 'حفظ الموظف الجديد' (Save new employee) button.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'حفظ الموظف الجديد' (Save new employee) button to submit the new employee form.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Open the 'الإدارة / القسم' (Department) dropdown to choose a department.
        # اختر الإدارة... الموارد البشرية والشؤون الحكومية... dropdown
        elem = page.locator("form").get_by_role("combobox").nth(1)
        await elem.click(timeout=10000)
        
        # -> Select 'الموارد البشرية والشؤون الحكومية' from the 'الإدارة / القسم' (Department) dropdown.
        # اختر الإدارة... الموارد البشرية والشؤون الحكومية... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[7]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'الفرع الرئيسي - الرياض' from the 'الفرع' dropdown
        # اختر الفرع... الفرع الرئيسي - الرياض فرع المنطقة... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[8]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'غير محدد المدة (مفتوح)' for 'نوع عقد العمل', enter contract start date '2026-09-16', then click the 'حفظ الموظف الجديد' button to save the employee.
        # محدد المدة (سنوي) غير محدد المدة (مفتوح) مؤقت /... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[9]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select 'غير محدد المدة (مفتوح)' for 'نوع عقد العمل', enter contract start date '2026-09-16', then click the 'حفظ الموظف الجديد' button to save the employee.
        # date field
        elem = page.locator("div").filter(has_text=re.compile(r"^تاريخ بداية العقد$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("2026-09-16")
        
        # -> Select 'غير محدد المدة (مفتوح)' for 'نوع عقد العمل', enter contract start date '2026-09-16', then click the 'حفظ الموظف الجديد' button to save the employee.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The new employee 'Test Employee' (ID 1089234123) appears in the employees register.
        # Assert-outcome: passed
        # Assert: The employee row contains the name 'Test Employee'.
        await expect(page.locator("tbody").nth(0)).to_contain_text("Test Employee", timeout=15000), "The employee row contains the name 'Test Employee'."
        # Assert-outcome: passed
        # Assert: The employee row contains the ID '1089234123'.
        await expect(page.locator("tbody").nth(0)).to_contain_text("1089234123", timeout=15000), "The employee row contains the ID '1089234123'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    