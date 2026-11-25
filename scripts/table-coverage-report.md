# Table coverage

Tables: 116 · writable with a minimal row: 25 · written by the application: 89 · never written by the application: 7

| table | written by the app | outcome | detail |
|---|---|---|---|
| additional_salaries | yes | needs a realistic row | insert or update on table "additional_salaries" violates foreign key constraint "additional_salaries_employee_id_fkey" |
| alerts_expiries | no | needs a realistic row | insert or update on table "alerts_expiries" violates foreign key constraint "alerts_expiries_employee_id_fkey" |
| allowance_types | yes | writable |  |
| annual_increase_approvals | yes | needs a realistic row | new row for relation "annual_increase_approvals" violates check constraint "annual_increase_approvals_action_check" |
| annual_increase_decisions | yes | needs a realistic row | insert or update on table "annual_increase_decisions" violates foreign key constraint "annual_increase_decisions_employee_id_fkey" |
| annual_review_reminders | yes | needs a realistic row | insert or update on table "annual_review_reminders" violates foreign key constraint "annual_review_reminders_employee_id_fkey" |
| annual_reviews | yes | needs a realistic row | insert or update on table "annual_reviews" violates foreign key constraint "annual_reviews_employee_id_fkey" |
| appraisals | yes | needs a realistic row | insert or update on table "appraisals" violates foreign key constraint "appraisals_employee_id_fkey" |
| approval_requests | yes | needs a realistic row | insert or update on table "approval_requests" violates foreign key constraint "approval_requests_workflow_id_fkey" |
| approval_workflow_steps | no | needs a realistic row | insert or update on table "approval_workflow_steps" violates foreign key constraint "approval_workflow_steps_workflow_id_fkey" |
| approval_workflows | yes | needs a realistic row | insert or update on table "approval_workflows" violates foreign key constraint "approval_workflows_entity_id_fkey" |
| asset_assignments | no | needs a realistic row | insert or update on table "asset_assignments" violates foreign key constraint "asset_assignments_asset_id_fkey" |
| assets | yes | needs a realistic row | insert or update on table "assets" violates foreign key constraint "assets_assigned_to_fkey" |
| attendance | yes | needs a realistic row | insert or update on table "attendance" violates foreign key constraint "attendance_employee_id_fkey" |
| attendance_devices | yes | needs a realistic row | insert or update on table "attendance_devices" violates foreign key constraint "attendance_devices_branch_id_fkey" |
| attendance_logs | yes | needs a realistic row | insert or update on table "attendance_logs" violates foreign key constraint "attendance_logs_employee_id_fkey" |
| audit_logs | yes | writable |  |
| bonuses_penalties | yes | needs a realistic row | insert or update on table "bonuses_penalties" violates foreign key constraint "bonuses_penalties_employee_id_fkey" |
| branches | yes | writable |  |
| candidates | yes | needs a realistic row | insert or update on table "candidates" violates foreign key constraint "candidates_job_id_fkey" |
| checklist_items | no | needs a realistic row | insert or update on table "checklist_items" violates foreign key constraint "checklist_items_checklist_id_fkey" |
| checklists | yes | needs a realistic row | insert or update on table "checklists" violates foreign key constraint "checklists_employee_id_fkey" |
| clearances | no | needs a realistic row | insert or update on table "clearances" violates foreign key constraint "clearances_employee_id_fkey" |
| countries | yes | writable |  |
| country_rule_items | yes | needs a realistic row | insert or update on table "country_rule_items" violates foreign key constraint "country_rule_items_country_code_fkey" |
| country_rules | no | writable |  |
| department_budgets | yes | writable |  |
| departments | yes | writable |  |
| disciplinary_violations | yes | needs a realistic row | insert or update on table "disciplinary_violations" violates foreign key constraint "disciplinary_violations_employee_id_fkey" |
| document_templates | no | writable |  |
| documents | yes | needs a realistic row | insert or update on table "documents" violates foreign key constraint "documents_employee_id_fkey" |
| employee_allowances | yes | needs a realistic row | insert or update on table "employee_allowances" violates foreign key constraint "employee_allowances_employee_id_fkey" |
| employee_clearances | yes | needs a realistic row | insert or update on table "employee_clearances" violates foreign key constraint "employee_clearances_employee_id_fkey" |
| employee_documents | yes | needs a realistic row | insert or update on table "employee_documents" violates foreign key constraint "employee_documents_employee_id_fkey" |
| employee_grievances | yes | needs a realistic row | insert or update on table "employee_grievances" violates foreign key constraint "employee_grievances_employee_id_fkey" |
| employee_suggestions | no | needs a realistic row | insert or update on table "employee_suggestions" violates foreign key constraint "employee_suggestions_employee_id_fkey" |
| employee_transfers | yes | needs a realistic row | insert or update on table "employee_transfers" violates foreign key constraint "employee_transfers_employee_id_fkey" |
| employee_webauthn_credentials | yes | needs a realistic row | insert or update on table "employee_webauthn_credentials" violates foreign key constraint "employee_webauthn_credentials_employee_id_fkey" |
| employees | yes | needs a realistic row | insert or update on table "employees" violates foreign key constraint "employees_branch_id_fkey" |
| entities | yes | needs a realistic row | insert or update on table "entities" violates foreign key constraint "entities_country_code_fkey" |
| eos_calculations | yes | needs a realistic row | insert or update on table "eos_calculations" violates foreign key constraint "eos_calculations_employee_id_fkey" |
| ewa_withdrawals | yes | needs a realistic row | insert or update on table "ewa_withdrawals" violates foreign key constraint "ewa_withdrawals_employee_id_fkey" |
| exit_interviews | yes | needs a realistic row | insert or update on table "exit_interviews" violates foreign key constraint "exit_interviews_employee_id_fkey" |
| expense_claims | yes | needs a realistic row | insert or update on table "expense_claims" violates foreign key constraint "expense_claims_employee_id_fkey" |
| fleet_traffic_fines | no | needs a realistic row | insert or update on table "fleet_traffic_fines" violates foreign key constraint "fleet_traffic_fines_vehicle_id_fkey" |
| fleet_vehicles | yes | needs a realistic row | insert or update on table "fleet_vehicles" violates foreign key constraint "fleet_vehicles_assigned_employee_id_fkey" |
| flexible_shifts | no | needs a realistic row | insert or update on table "flexible_shifts" violates foreign key constraint "flexible_shifts_employee_id_fkey" |
| flexible_work_shifts | yes | needs a realistic row | insert or update on table "flexible_work_shifts" violates foreign key constraint "flexible_work_shifts_employee_id_fkey" |
| flight_tickets | yes | needs a realistic row | insert or update on table "flight_tickets" violates foreign key constraint "flight_tickets_employee_id_fkey" |
| generated_documents | no | writable |  |
| government_renewals | yes | needs a realistic row | insert or update on table "government_renewals" violates foreign key constraint "government_renewals_employee_id_fkey" |
| grievances | no | needs a realistic row | insert or update on table "grievances" violates foreign key constraint "grievances_employee_id_fkey" |
| health_certificates | yes | writable |  |
| hearing_sessions | yes | needs a realistic row | insert or update on table "hearing_sessions" violates foreign key constraint "hearing_sessions_grievance_id_fkey" |
| hearings | no | needs a realistic row | insert or update on table "hearings" violates foreign key constraint "hearings_grievance_id_fkey" |
| hr_generated_letters | yes | needs a realistic row | insert or update on table "hr_generated_letters" violates foreign key constraint "hr_generated_letters_employee_id_fkey" |
| hse_inspections | yes | needs a realistic row | insert or update on table "hse_inspections" violates foreign key constraint "hse_inspections_branch_id_fkey" |
| hse_ppe_logs | yes | needs a realistic row | insert or update on table "hse_ppe_logs" violates foreign key constraint "hse_ppe_logs_employee_id_fkey" |
| insurance_companies | yes | needs a realistic row | duplicate key value violates unique constraint "insurance_companies_pkey" |
| insurance_coverage_categories | yes | needs a realistic row | duplicate key value violates unique constraint "insurance_coverage_categories_pkey" |
| insurance_endorsements | yes | writable |  |
| job_openings | yes | writable |  |
| kiosk_security_logs | yes | needs a realistic row | insert or update on table "kiosk_security_logs" violates foreign key constraint "kiosk_security_logs_device_id_fkey" |
| kudos | yes | needs a realistic row | insert or update on table "kudos" violates foreign key constraint "kudos_from_employee_id_fkey" |
| leaves | yes | needs a realistic row | insert or update on table "leaves" violates foreign key constraint "leaves_employee_id_fkey" |
| loans | yes | needs a realistic row | insert or update on table "loans" violates foreign key constraint "loans_employee_id_fkey" |
| medical_dependents | yes | needs a realistic row | insert or update on table "medical_dependents" violates foreign key constraint "medical_dependents_policy_id_fkey" |
| medical_policies | yes | needs a realistic row | insert or update on table "medical_policies" violates foreign key constraint "medical_policies_employee_id_fkey" |
| notifications | yes | writable |  |
| official_warnings | yes | needs a realistic row | insert or update on table "official_warnings" violates foreign key constraint "official_warnings_employee_id_fkey" |
| overtime | no | needs a realistic row | insert or update on table "overtime" violates foreign key constraint "overtime_employee_id_fkey" |
| overtime_records | yes | needs a realistic row | insert or update on table "overtime_records" violates foreign key constraint "overtime_records_employee_id_fkey" |
| password_reset_requests | yes | needs a realistic row | insert or update on table "password_reset_requests" violates foreign key constraint "password_reset_requests_user_id_fkey" |
| payroll | yes | needs a realistic row | insert or update on table "payroll" violates foreign key constraint "payroll_employee_id_fkey" |
| payroll_corrections | yes | needs a realistic row | insert or update on table "payroll_corrections" violates foreign key constraint "payroll_corrections_employee_id_fkey" |
| peer_kudos | yes | writable |  |
| permissions | no | writable |  |
| policies | no | writable |  |
| positions | yes | needs a realistic row | insert or update on table "positions" violates foreign key constraint "positions_department_id_fkey" |
| projects | yes | needs a realistic row | insert or update on table "projects" violates foreign key constraint "projects_department_id_fkey" |
| promotions | yes | needs a realistic row | insert or update on table "promotions" violates foreign key constraint "promotions_employee_id_fkey" |
| pulse_survey_results | no | writable |  |
| pulse_surveys | no | needs a realistic row | insert or update on table "pulse_surveys" violates foreign key constraint "pulse_surveys_target_department_id_fkey" |
| qiwa_contracts | yes | needs a realistic row | insert or update on table "qiwa_contracts" violates foreign key constraint "qiwa_contracts_employee_id_fkey" |
| recruitment_candidates | no | needs a realistic row | insert or update on table "recruitment_candidates" violates foreign key constraint "recruitment_candidates_job_id_fkey" |
| recruitment_jobs | yes | needs a realistic row | insert or update on table "recruitment_jobs" violates foreign key constraint "recruitment_jobs_department_id_fkey" |
| reward_catalog | yes | writable |  |
| reward_redemptions | yes | writable |  |
| rewards_catalog | no | writable |  |
| rewards_redemptions | no | needs a realistic row | insert or update on table "rewards_redemptions" violates foreign key constraint "rewards_redemptions_employee_id_fkey" |
| salary_certificates | yes | needs a realistic row | insert or update on table "salary_certificates" violates foreign key constraint "salary_certificates_employee_id_fkey" |
| salary_components | yes | writable |  |
| salary_slip_items | yes | needs a realistic row | insert or update on table "salary_slip_items" violates foreign key constraint "salary_slip_items_slip_id_fkey" |
| salary_slips | yes | needs a realistic row | insert or update on table "salary_slips" violates foreign key constraint "salary_slips_employee_id_fkey" |
| salary_structure_components | yes | needs a realistic row | insert or update on table "salary_structure_components" violates foreign key constraint "salary_structure_components_structure_id_fkey" |
| salary_structures | yes | needs a realistic row | insert or update on table "salary_structures" violates foreign key constraint "salary_structures_entity_id_fkey" |
| schema_migrations | yes | writable |  |
| sessions | yes | needs a realistic row | insert or update on table "sessions" violates foreign key constraint "sessions_user_id_fkey" |
| settings | yes | writable |  |
| signup_requests | yes | needs a realistic row | insert or update on table "signup_requests" violates foreign key constraint "signup_requests_reviewed_by_fkey" |
| smart_assets | yes | needs a realistic row | insert or update on table "smart_assets" violates foreign key constraint "smart_assets_current_assigned_to_fkey" |
| succession_plans | yes | writable |  |
| survey_responses | no | needs a realistic row | insert or update on table "survey_responses" violates foreign key constraint "survey_responses_survey_id_fkey" |
| talent_assessments | yes | needs a realistic row | insert or update on table "talent_assessments" violates foreign key constraint "talent_assessments_employee_id_fkey" |
| talent_succession | no | needs a realistic row | insert or update on table "talent_succession" violates foreign key constraint "talent_succession_position_id_fkey" |
| tasks | yes | needs a realistic row | insert or update on table "tasks" violates foreign key constraint "tasks_project_id_fkey" |
| tax_brackets | no | needs a realistic row | insert or update on table "tax_brackets" violates foreign key constraint "tax_brackets_country_code_fkey" |
| tax_exemption_declarations | yes | needs a realistic row | insert or update on table "tax_exemption_declarations" violates foreign key constraint "tax_exemption_declarations_employee_id_fkey" |
| tax_exemptions | no | needs a realistic row | insert or update on table "tax_exemptions" violates foreign key constraint "tax_exemptions_employee_id_fkey" |
| telework_permits | yes | needs a realistic row | insert or update on table "telework_permits" violates foreign key constraint "telework_permits_employee_id_fkey" |
| traffic_fines | yes | writable |  |
| users | yes | needs a realistic row | insert or update on table "users" violates foreign key constraint "users_entity_id_fkey" |
| visas | yes | needs a realistic row | insert or update on table "visas" violates foreign key constraint "visas_employee_id_fkey" |
| warnings | no | needs a realistic row | insert or update on table "warnings" violates foreign key constraint "warnings_employee_id_fkey" |
| work_injuries | yes | skipped | a column type has no stand-in value |
| workflow_requests | no | needs a realistic row | insert or update on table "workflow_requests" violates foreign key constraint "workflow_requests_workflow_id_fkey" |
