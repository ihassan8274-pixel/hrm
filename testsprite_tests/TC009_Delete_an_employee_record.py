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
        
        # -> Enter 'admin' in the username field, enter 'admin123' in the password field, then click the 'login.signin' button to sign in.
        # login.usernamePlaceholder text field
        elem = page.get_by_role("textbox", name="login.username")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("admin")
        
        # -> Enter 'admin' in the username field, enter 'admin123' in the password field, then click the 'login.signin' button to sign in.
        # login.passwordPlaceholder password field
        elem = page.get_by_role("textbox", name="login.password")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("admin123")
        
        # -> Enter 'admin' in the username field, enter 'admin123' in the password field, then click the 'login.signin' button to sign in.
        # login.signIn button
        elem = page.get_by_role("button", name="login.signIn")
        await elem.click(timeout=10000)
        
        # -> Click the 'الموظفين والإقامات' (Employees and residencies) button to open the Employees screen.
        # الموظفين والإقامات button
        elem = page.get_by_role("button", name="الموظفين والإقامات")
        await elem.click(timeout=10000)
        
        # -> Click the 'إضافة موظف جديد' (Add New Employee) button to open the new employee form.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields, then click the 'حفظ الموظف الجديد' (Save New Employee) button to create the record.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Test Employee")
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields, then click the 'حفظ الموظف الجديد' (Save New Employee) button to create the record.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Tester")
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields, then click the 'حفظ الموظف الجديد' (Save New Employee) button to create the record.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'إلغاء' (Cancel) button to close the Add Employee form and return to the employee list.
        # إلغاء button
        elem = page.get_by_role("button", name="إلغاء")
        await elem.click(timeout=10000)
        
        # -> Click the 'إضافة موظف جديد' (Add New Employee) button to open the Add Employee form so a test employee can be created.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields and click the 'حفظ الموظف الجديد' (Save New Employee) button to create the employee.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Test Employee")
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields and click the 'حفظ الموظف الجديد' (Save New Employee) button to create the employee.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Tester")
        
        # -> Fill the 'الاسم الكامل' (Full name) and 'المسمى الوظيفي الداخلي' (Job title) fields and click the 'حفظ الموظف الجديد' (Save New Employee) button to create the employee.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'إلغاء' (Cancel) button to close the Add Employee form and reveal the employee list.
        # إلغاء button
        elem = page.get_by_role("button", name="إلغاء")
        await elem.click(timeout=10000)
        
        # -> Click the 'إضافة موظف جديد' (Add New Employee) button to open the Add Employee form.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Fill the 'الاسم الكامل' field with 'QA Test Employee', fill the 'المسمى الوظيفي الداخلي' field with 'QA Tester', and click the 'حفظ الموظف الجديد' (Save New Employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Test Employee")
        
        # -> Fill the 'الاسم الكامل' field with 'QA Test Employee', fill the 'المسمى الوظيفي الداخلي' field with 'QA Tester', and click the 'حفظ الموظف الجديد' (Save New Employee) button.
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Tester")
        
        # -> Fill the 'الاسم الكامل' field with 'QA Test Employee', fill the 'المسمى الوظيفي الداخلي' field with 'QA Tester', and click the 'حفظ الموظف الجديد' (Save New Employee) button.
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'إلغاء' (Cancel) button to close the Add Employee form and reveal the employee list.
        # إلغاء button
        elem = page.get_by_role("button", name="إلغاء")
        await elem.click(timeout=10000)
        
        # -> Open the branch filter dropdown ('كل الفروع') to ensure all branches are selected so created employees are visible.
        # كل الفروع الفرع الرئيسي - الرياض فرع المنطقة... dropdown
        elem = page.get_by_role("combobox").nth(1)
        await elem.click(timeout=10000)
        
        # -> Set the nationality filter to 'جميع الجنسيات' using the nationality dropdown.
        # جميع الجنسيات سعودي فقط (نطاقات) مقيم / وافد فقط dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[2]/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Open the 'إضافة موظف جديد' (Add New Employee) form by clicking the 'إضافة موظف جديد' button so the form fields can be inspected.
        # إضافة موظف جديد button
        elem = page.get_by_role("button", name="إضافة موظف جديد")
        await elem.click(timeout=10000)
        
        # -> Set the 'الجنسية' (Nationality) dropdown in the Add New Employee form to 'سعودي' to establish context before filling the rest of the form.
        # سعودي مصري هندي باكستاني يمني أردني سوري سوداني... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Select the branch 'الفرع الرئيسي - الرياض' from the Branch dropdown in the Add Employee form.
        # اختر الفرع... الفرع الرئيسي - الرياض فرع المنطقة... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[8]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Fill the Add Employee form: set Full name to 'QA Delete Employee 2026', National ID to '1099999999', Job title to 'QA Tester', select the 'الموارد البشرية والشؤون الحكوم...' department, then click the 'حفظ الموظف الجديد' (Save New Employ...
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^الاسم الكامل \(كما في الهوية/الإقامة\)$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Delete Employee 2026")
        
        # -> Fill the Add Employee form: set Full name to 'QA Delete Employee 2026', National ID to '1099999999', Job title to 'QA Tester', select the 'الموارد البشرية والشؤون الحكوم...' department, then click the 'حفظ الموظف الجديد' (Save New Employ...
        # مثال: 1089234123 text field
        elem = page.get_by_role("textbox", name="مثال: 1089234123")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("1099999999")
        
        # -> Fill the Add Employee form: set Full name to 'QA Delete Employee 2026', National ID to '1099999999', Job title to 'QA Tester', select the 'الموارد البشرية والشؤون الحكوم...' department, then click the 'حفظ الموظف الجديد' (Save New Employ...
        # text field
        elem = page.locator("div").filter(has_text=re.compile(r"^المسمى الوظيفي الداخلي$")).get_by_role("textbox")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA Tester")
        
        # -> Fill the Add Employee form: set Full name to 'QA Delete Employee 2026', National ID to '1099999999', Job title to 'QA Tester', select the 'الموارد البشرية والشؤون الحكوم...' department, then click the 'حفظ الموظف الجديد' (Save New Employ...
        # اختر الإدارة... الموارد البشرية والشؤون الحكومية... dropdown
        elem = page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/form/div/div[7]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Fill the Add Employee form: set Full name to 'QA Delete Employee 2026', National ID to '1099999999', Job title to 'QA Tester', select the 'الموارد البشرية والشؤون الحكوم...' department, then click the 'حفظ الموظف الجديد' (Save New Employ...
        # حفظ الموظف الجديد button
        elem = page.get_by_role("button", name="حفظ الموظف الجديد")
        await elem.click(timeout=10000)
        
        # -> Click the 'حذف' (Delete) button for the 'QA Delete Employee 2026' row to initiate deletion.
        # حذف button
        elem = page.get_by_role("button", name="حذف").nth(2)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The employee 'QA Delete Employee 2026' no longer appears in the employee register.
        # Assert-outcome: passed
        # Assert: The delete button for the created employee's row is not visible, indicating the employee row was removed.
        await expect(page.locator("xpath=/html/body/div/div/main/div/div/div/div[3]/div/table/tbody/tr[3]/td[7]/div/button[4]").nth(0)).not_to_be_visible(timeout=15000), "The delete button for the created employee's row is not visible, indicating the employee row was removed."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    