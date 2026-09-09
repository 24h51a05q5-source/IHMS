export const CURRENT_TERMS_VERSION = '1.0';
export const TERMS_EFFECTIVE_DATE = 'September 8, 2026';
export const TERMS_LAST_UPDATED = 'September 8, 2026';

export interface TermsSection {
  id: string;
  title: string;
  summary: string;
  content: string;
  applicableTo: 'ALL' | 'STUDENT' | 'OWNER';
  order: number;
}

/**
 * Contractual Terms & Conditions applicable exclusively to Hostel Owners and Property Management.
 */
export const OWNER_TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'owner-platform-use',
    title: '1. Use of the IHMS Platform',
    summary: 'Grant of operational license and scope of cloud ERP services.',
    content: `Integrated Hostel Management System ("IHMS") grants you a non-exclusive, non-transferable, revocable license to access and use the platform strictly for managing your registered residential hostel properties, branches, staff, student admissions, fee collections, and day-to-day lodging operations.

You acknowledge that IHMS provides cloud-based enterprise resource planning ("ERP") software infrastructure. IHMS is not a real estate broker, residential hostel operator, physical landlord, or insurer. The legal and operational relationship for providing physical lodging, boarding, food, and facilities exists exclusively between your establishment and your enrolled residents.`,
    applicableTo: 'OWNER',
    order: 1,
  },
  {
    id: 'owner-listing-accuracy',
    title: '2. Hostel and Listing Information Accuracy',
    summary: 'Obligation to maintain truthful, accurate property descriptions and capacities.',
    content: `You warrant that all information, photographs, room types, bed capacities, amenities, facilities, and fee schedules published or managed through the IHMS platform are truthful, accurate, and current. You agree not to misrepresent hostel capacities or deliberately overbook rooms beyond approved physical occupancy limits.

Any material discrepancies between the facilities advertised on the platform and the physical premises provided to students remain your sole legal responsibility. You agree to promptly update IHMS records whenever there are changes in hostel inventory, room configurations, pricing structures, or operational status.`,
    applicableTo: 'OWNER',
    order: 2,
  },
  {
    id: 'owner-student-management',
    title: '3. Student and Resident Management Responsibilities',
    summary: 'Management duties regarding student admissions, welfare, and emergency handling.',
    content: `As a hostel owner or management administrator, you are solely responsible for admitting, verifying, and supervising students residing on your premises. You must establish and enforce transparent hostel residency rules, curfew hours, visitor policies, and code of conduct standards in accordance with applicable laws.

You agree to maintain functional grievance redressal mechanisms and actively respond to maintenance complaints and student requests logged through the IHMS portal within standard operational timeframes. You further agree to maintain updated emergency contact information for all residents and facilitate immediate assistance in the event of medical emergencies or safety incidents.`,
    applicableTo: 'OWNER',
    order: 3,
  },
  {
    id: 'owner-fee-payments',
    title: '4. Fee and Payment Responsibilities',
    summary: 'Transparent billing, receipt issuance, and security deposit accounting.',
    content: `All fee schedules, installment plans, security deposits, mess charges, and utility tariffs configured in IHMS must be clearly communicated to enrolled students without hidden fees. You agree that every payment received—whether processed online via integrated payment gateways or recorded as an offline transaction—must be accurately recorded in IHMS with an official digital receipt issued to the resident.

You are responsible for the lawful custody, accounting, and timely refund of refundable security deposits upon student checkout, subject to legitimate deductions for unpaid dues or verified property damage. IHMS is not responsible for handling cash collections or enforcing fee recovery from defaulting residents.`,
    applicableTo: 'OWNER',
    order: 4,
  },
  {
    id: 'owner-room-accommodation',
    title: '5. Room and Accommodation Information',
    summary: 'Physical room standards, safety certifications, and bed allocation records.',
    content: `You agree to ensure that all rooms, beds, and shared amenities allocated through IHMS meet basic hygiene, safety, ventilation, and structural standards prescribed by municipal authorities. You must keep digital room allocations synchronized with physical occupancy at all times to prevent double allocations or unrecorded occupancies.

Routine inspections, sanitization, pest control, and essential utility provisions (potable drinking water, reliable electricity, adequate plumbing, and secure locking mechanisms) are your ongoing operational obligations.`,
    applicableTo: 'OWNER',
    order: 5,
  },
  {
    id: 'owner-data-privacy',
    title: '6. Student Information and Privacy Responsibilities',
    summary: 'Confidentiality of student records, government IDs, and contact information.',
    content: `In operating IHMS, you will handle sensitive resident data, including student full names, contact numbers, official government identification documents (such as Aadhaar or Passport numbers), biometric attendance logs, and parent/guardian contact details. You agree to treat all student information with the highest degree of confidentiality and implement appropriate organizational safeguards to prevent data leakage.

You are expressly prohibited from selling, renting, transferring, or disclosing resident data to external marketing agencies, commercial third parties, or unauthorized individuals. Student information may only be processed for legitimate hostel administration purposes or shared with lawful law enforcement authorities upon formal statutory request.`,
    applicableTo: 'OWNER',
    order: 6,
  },
  {
    id: 'owner-account-security',
    title: '7. Account and Credential Security',
    summary: 'Owner login protection, multi-user role management, and access controls.',
    content: `You are responsible for safeguarding your owner and administrative account credentials, passwords, two-factor authentication tokens, and staff access permissions. You agree to assign appropriate role-based access levels (such as Warden, Accountant, or Receptionist) to your employees and immediately revoke access for former staff members upon cessation of their employment.

You agree not to share administrative credentials with external third parties. Any operational change, financial entry, student transfer, or configuration update executed under your authenticated account shall be legally attributed to your establishment.`,
    applicableTo: 'OWNER',
    order: 7,
  },
  {
    id: 'owner-legal-compliance',
    title: '8. Compliance with Applicable Laws',
    summary: 'Adherence to municipal trade licenses, fire safety NOCs, and police verification.',
    content: `You represent and warrant that your hostel premises comply with all applicable local, municipal, state, and national laws and regulations. This includes obtaining and maintaining valid commercial lodging permits, trade licenses, fire safety no-objection certificates (NOC), public health clearances, and local police verification records for all residents and hostel personnel.

You agree to indemnify and hold harmless IHMS and its officers from any legal penalties, municipal notices, fines, or litigation arising from your failure to maintain statutory compliance for your physical properties.`,
    applicableTo: 'OWNER',
    order: 8,
  },
  {
    id: 'owner-prohibited-use',
    title: '9. Prohibited Use and Misuse',
    summary: 'Restrictions against system tampering, reverse engineering, and automated scraping.',
    content: `You agree not to use the IHMS platform for any unlawful, deceptive, or abusive purposes. Prohibited activities include attempting to bypass security barriers, probing or scanning platform infrastructure, introducing malicious code or viruses, reverse engineering the source code, or employing automated scripts, bots, or scrapers to extract data from the platform.

You further agree not to use the announcement, notification, or messaging channels to transmit defamatory, threatening, obscene, discriminatory, or unlawful content to students or staff.`,
    applicableTo: 'OWNER',
    order: 9,
  },
  {
    id: 'owner-fraud-prevention',
    title: '10. Fraudulent or Unauthorized Activity',
    summary: 'Strict prohibition of fictitious transactions, UTR falsification, or ledger manipulation.',
    content: `You agree to uphold strict financial integrity across all platform operations. Generating fictitious payment records, falsifying banking transaction references (UTRs), recording false refunds, manipulating accounting vouchers, or processing unauthorized chargebacks is strictly prohibited and constitutes a material breach of these Terms.

IHMS reserves the right to freeze platform access, initiate forensic audits, and report suspected financial fraud or tax evasion to competent statutory authorities.`,
    applicableTo: 'OWNER',
    order: 10,
  },
  {
    id: 'owner-platform-limitations',
    title: '11. Platform Limitations and Disclaimers',
    summary: 'Software provided as-is, uptime targets, and exclusion of physical property liability.',
    content: `The IHMS software platform is provided on an "as is" and "as available" basis. While IHMS implements enterprise cloud redundancy and industry-standard uptime safeguards, IHMS does not guarantee that services will be uninterrupted or completely error-free during scheduled maintenance, telecommunication disruptions, or third-party cloud infrastructure outages.

Under no circumstances shall IHMS or its directors be liable for physical property damage, theft, personal injury, accidents, fire, water shortages, or tenant disputes occurring on your hostel premises. Such occurrences remain under your exclusive operational jurisdiction.`,
    applicableTo: 'OWNER',
    order: 11,
  },
  {
    id: 'owner-termination',
    title: '12. Suspension or Termination',
    summary: 'Grounds for deactivation, license revocation, and data retrieval rights upon exit.',
    content: `IHMS reserves the right to suspend or terminate your platform access upon: (a) repeated or material breach of these Terms; (b) non-payment of agreed software subscription fees; (c) fraudulent, deceptive, or unlawful operational practices; or (d) formal directive by court order or statutory law enforcement bodies.

Upon termination, your right to access administrative functions will cease. Subject to applicable legal retention requirements, you will be granted a reasonable window of thirty (30) calendar days to export your student rosters, fee ledgers, and historical financial reports.`,
    applicableTo: 'OWNER',
    order: 12,
  },
  {
    id: 'owner-disputes',
    title: '13. Dispute Handling and Governing Law',
    summary: 'Jurisdiction in Hyderabad, Telangana, India and arbitration mechanisms.',
    content: `These Terms & Conditions shall be governed by and construed in accordance with the substantive laws of the Republic of India. In the event of any operational or contractual disagreement arising between you and IHMS, the parties agree to first seek an amicable resolution through formal executive mediation.

If mediation does not resolve the dispute within thirty (30) days, the dispute shall be settled by binding arbitration conducted under the Arbitration and Conciliation Act, 1996, in Hyderabad, Telangana. Subject to arbitration, the competent civil courts of Hyderabad shall have exclusive jurisdiction.`,
    applicableTo: 'OWNER',
    order: 13,
  },
  {
    id: 'owner-changes-to-terms',
    title: '14. Changes to Terms',
    summary: 'Notification of material updates and version increment protocols.',
    content: `IHMS reserves the right to update or modify these Terms & Conditions from time to time to reflect technological improvements, legislative changes, or service enhancements. Whenever material updates are made, the Terms version number will be incremented (e.g. from Version 1.0 to Version 1.1) and presented upon your next login.

Continued use of the IHMS platform following the publication of updated Terms constitutes your full acceptance of the revised agreement.`,
    applicableTo: 'OWNER',
    order: 14,
  },
  {
    id: 'owner-contact-info',
    title: '15. Legal and Contact Information',
    summary: 'Official corporate, legal, and operational support contacts.',
    content: `For legal inquiries, operational compliance queries, or contractual communications concerning these Terms & Conditions, you may reach our team at:

Integrated Hostel Management System (IHMS)
Email: ihmserp00@gmail.com`,
    applicableTo: 'OWNER',
    order: 15,
  },
];

/**
 * 15 Contractual Terms & Conditions applicable exclusively to Enrolled Students and Boarders.
 */
export const STUDENT_TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'student-eligibility-enrollment',
    title: '1. Eligibility and Enrollment',
    summary: 'Valid student/resident status, accurate documentation, and admission criteria.',
    content: `To be eligible for residency and to access the IHMS student portal, you must be a bonafide student or working resident actively admitted to a registered hostel facility. You warrant that all personal data, academic enrolment details, government identification proofs (such as Aadhaar, Student ID, or Passport), contact numbers, and parent/guardian emergency contact details provided during admission or updated via the portal are genuine, truthful, and accurate.

You agree to promptly update your profile or notify hostel administration within forty-eight (48) hours of any changes in your phone number, email address, course enrolment, or guardian contact information to ensure emergency communication channels remain valid.`,
    applicableTo: 'STUDENT',
    order: 1,
  },
  {
    id: 'student-hostel-rules-conduct',
    title: '2. Hostel Rules and Code of Conduct',
    summary: 'Discipline, curfew, visitor policy, and statutory anti-ragging compliance.',
    content: `As an enrolled resident, you agree to strictly comply with all hostel regulations, standard operating procedures, and administrative circulars issued by hostel owners and wardens via IHMS announcements. This includes adhering to prescribed gate closing and curfew hours, biometric check-ins, dining hall meal timings, and quiet hours designated for rest and study.

Ragging in any form is strictly prohibited under applicable anti-ragging legislation and hostel regulations. Any student found engaging in ragging, physical assault, verbal abuse, intimidation, bullying, or harassment of any resident or staff member will face immediate expulsion and criminal reporting. Overnight visitors are strictly prohibited in residential rooms without prior written authorization from the warden.`,
    applicableTo: 'STUDENT',
    order: 2,
  },
  {
    id: 'student-room-allocation',
    title: '3. Room Allocation and Accommodation',
    summary: 'Assigned room and bed rights, non-subletting, and key responsibilities.',
    content: `You are entitled to occupy only the specific room number and bed assigned to you as recorded in IHMS. You may not swap rooms, switch beds, or occupy vacant beds without prior formal approval and a recorded room transfer issued by hostel management.

Subletting, transferring, or allowing non-registered third parties or unauthorized guests to occupy your bed or stay overnight is strictly forbidden. You are responsible for the safe custody of your room keys or electronic access cards and must immediately report any lost keys to the hostel administration.`,
    applicableTo: 'STUDENT',
    order: 3,
  },
  {
    id: 'student-fee-payments-dues',
    title: '4. Fee Payments and Dues',
    summary: 'Timely settlement of monthly fees, late penalties, and digital receipts.',
    content: `You agree to pay all recurring hostel rent, mess fees, maintenance charges, and utility dues on or before the due date specified on your IHMS payment schedule. Invoices and upcoming due reminders are delivered to your portal and notification center.

Failure to settle dues within the designated timeline may attract applicable late payment penalties, suspension of mess dining privileges, or administrative holds on room allocation. Official digital receipts are automatically generated and stored in your portal upon successful payment confirmation, serving as proof of settlement.`,
    applicableTo: 'STUDENT',
    order: 4,
  },
  {
    id: 'student-deposit-refund-terms',
    title: '5. Security Deposit and Refund Terms',
    summary: 'Deposit custody, damage deductions, and refund disbursement timeline.',
    content: `Refunds of advance hostel rent, mess fees, and security deposits are governed strictly by the published checkout and cancellation policy of your specific hostel management. Security deposits are refundable upon completion of your stay duration, subject to clearance of all outstanding fee dues and formal physical room inspection.

Legitimate deductions may be applied from refundable deposits for unreturned keys, verified property damage, or unpaid utility bills. Approved refunds are processed and disbursed through bank transfer within the timeframe formally stipulated by hostel management (typically 15 to 30 business days after clearance).`,
    applicableTo: 'STUDENT',
    order: 5,
  },
  {
    id: 'student-maintenance-property-care',
    title: '6. Maintenance and Property Care',
    summary: 'Defect reporting via tickets, room cleanliness, and damage liability.',
    content: `You agree to maintain your room and shared premises in a clean, hygienic, and safe condition. You are personally liable for any physical damage, breakage, defacement, or loss caused to your allocated room, furniture, fittings, electrical equipment, and sanitary wares.

If any fixture, plumbing system, or electrical fitting requires repair, you agree to promptly log a maintenance ticket through the IHMS student portal. In common areas (such as TV lounges, study halls, corridors, and dining halls), damages caused by unidentified groups may be assessed as collective liability among residents in accordance with hostel policy.`,
    applicableTo: 'STUDENT',
    order: 6,
  },
  {
    id: 'student-safety-belongings',
    title: '7. Safety, Security, and Personal Belongings',
    summary: 'Personal responsibility for valuables, locking protocols, and emergencies.',
    content: `You are solely responsible for safeguarding your personal belongings, cash, laptops, smartphones, jewelry, and academic materials. You are required to keep your room locked whenever absent and keep your wardrobe or secure locker locked at all times.

Neither the hostel management nor IHMS accepts responsibility or liability for lost, stolen, or damaged personal valuables. In the event of fire alarms, medical emergencies, or safety incidents, you agree to immediately follow warden directives, emergency evacuation protocols, and notify hostel emergency response personnel.`,
    applicableTo: 'STUDENT',
    order: 7,
  },
  {
    id: 'student-portal-account-use',
    title: '8. Student Portal and Account Use',
    summary: 'Credential secrecy, self-service features, and authorized digital actions.',
    content: `The Integrated Hostel Management System ("IHMS") provides you with personal access to the student self-service portal to view room details, check fee balances, make digital payments, download receipts, submit leave requests, track attendance, and log maintenance tickets.

Your portal account is strictly personal and non-transferable. You agree to safeguard your credentials and never disclose your password or OTP to any third party. Any ticket submitted, leave requested, or payment initiated under your authenticated credentials will be treated as authorized by you.`,
    applicableTo: 'STUDENT',
    order: 8,
  },
  {
    id: 'student-prohibited-activities',
    title: '9. Prohibited Activities',
    summary: 'Zero tolerance for substance abuse, unauthorized appliances, and nuisance.',
    content: `You agree to maintain high standards of discipline and community respect. The following activities are strictly prohibited and subject to immediate disciplinary action, fine, eviction, and police reporting:

- Possession, consumption, sale, or distribution of alcohol, narcotics, drugs, tobacco, or contraband substances on hostel premises.
- Bringing firearms, weapons, explosives, fireworks, or hazardous materials into hostel premises.
- Cooking in residential rooms or using unauthorized high-wattage electrical appliances (such as electric coils, immersion heaters, or induction plates).
- Gambling, playing loud music during quiet hours, disturbing other residents, or engaging in disorderly conduct.
- Damaging fire safety equipment, surveillance cameras, or biometric attendance readers.`,
    applicableTo: 'STUDENT',
    order: 9,
  },
  {
    id: 'student-health-medical-info',
    title: '10. Health and Medical Information',
    summary: 'Disclosure of medical conditions and consent for emergency medical care.',
    content: `You agree to disclose any chronic medical conditions, severe allergies, or ongoing treatments to hostel management upon admission so that emergency responders can provide appropriate care if needed.

In the event of an acute illness or medical emergency, you authorize hostel management to contact your designated emergency contact persons and facilitate immediate medical treatment, ambulance transportation, or hospitalization at your expense.`,
    applicableTo: 'STUDENT',
    order: 10,
  },
  {
    id: 'student-checkout-vacating',
    title: '11. Check-Out and Vacating Procedures',
    summary: 'Formal notice period, physical room handover, and clearance certificate.',
    content: `When vacating the hostel permanently or concluding your academic year, you must submit a formal checkout request through IHMS adhering to the required advance notice period (typically 30 calendar days).

You must surrender all keys, return borrowed items, clear all pending fee dues, and undergo a joint room inspection with hostel staff. A digital No-Dues Clearance Certificate will be issued upon completion, which is mandatory for the release of security deposits and security clearance.`,
    applicableTo: 'STUDENT',
    order: 11,
  },
  {
    id: 'student-limitation-liability',
    title: '12. Limitation of Liability',
    summary: 'Scope of platform responsibility and hostel liability boundaries.',
    content: `IHMS provides cloud enterprise software and is not the physical owner, operator, landlord, or insurer of the hostel premises. Under no circumstances shall IHMS or its operators be liable for personal injuries, thefts, property loss, power cuts, water shortages, food quality disputes, or interpersonal conflicts occurring at the hostel.

Hostel management liability is strictly limited as defined under the hostel admission agreement and applicable local statutory laws.`,
    applicableTo: 'STUDENT',
    order: 12,
  },
  {
    id: 'student-dispute-handling',
    title: '13. Dispute Handling and Grievance Redressal',
    summary: 'Formal internal grievance tickets and jurisdictional procedures.',
    content: `If you have any grievance regarding room maintenance, food quality, billing disputes, or staff conduct, you agree to first submit an official ticket through the IHMS Complaints portal. Hostel management is obligated to review and address grievances in accordance with established service level guidelines.

If an issue cannot be resolved internally through hostel management, any formal legal dispute shall be subject to the exclusive jurisdiction of the competent civil courts in Hyderabad, Telangana, India.`,
    applicableTo: 'STUDENT',
    order: 13,
  },
  {
    id: 'student-changes-to-terms',
    title: '14. Changes to Terms',
    summary: 'Updates notification and mandatory re-acceptance protocols.',
    content: `IHMS and hostel management may periodically revise these Terms to accommodate legislative requirements or updated residential guidelines. When material updates are published, you will be prompted to review and accept the updated Terms upon your next portal sign-in.

Continued use of the IHMS student portal constitutes your agreement to the updated Terms & Conditions.`,
    applicableTo: 'STUDENT',
    order: 14,
  },
  {
    id: 'student-contact-info',
    title: '15. Contact and Support Information',
    summary: 'Official support and contact information.',
    content: `If you have questions regarding these Terms, require assistance with your account, or need support, you may contact:

Integrated Hostel Management System (IHMS)
Email: ihmserp00@gmail.com`,
    applicableTo: 'STUDENT',
    order: 15,
  },
];

/**
 * 10 Platform-wide Terms & Conditions for unauthenticated or general legal reference.
 */
export const DEFAULT_PLATFORM_TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'service-description',
    title: '1. Platform & Service Description',
    summary: 'Overview of IHMS SaaS cloud architecture, enterprise modules, and operational boundaries.',
    content: `1.1 System Nature:
Integrated Hostel Management System ("IHMS") is an enterprise cloud resource planning (ERP) platform designed to streamline hostel administration, bed/room allocations, student admissions, fee collections, digital receipts, biometric attendance, gate passes, and maintenance complaint management.

1.2 Role of Platform:
IHMS functions strictly as a technology software provider. IHMS does not own, operate, manage, or physically inspect any hostel facility registered on the platform. The legal relationship for lodging, boarding, food, amenities, and security exists exclusively between the Hostel Owner/Management and the enrolled Student/Resident.

1.3 Access Authorization:
Access to IHMS is granted solely to registered and verified Hostel Owners, Branch Managers, Wardens, Staff, and actively admitted Students. Any unauthorized attempt to breach, bypass, or tamper with system authentication is strictly prohibited.`,
    applicableTo: 'ALL',
    order: 1,
  },
  {
    id: 'student-terms',
    title: '2. Student Residency Terms & Obligations',
    summary: 'Legal obligations, code of conduct, room care, fee deadlines, and rules governing enrolled students.',
    content: `2.1 Admission & Identification:
Students must provide authentic, verifiable identification details, academic affiliation records, and emergency contact details upon registration. Providing fraudulent identity or contact information constitutes ground for immediate expulsion.

2.2 Hostel Rules & Curfews:
Students must strictly abide by the hostel rules, quiet hours, gate closing times, visitor policies, and warden instructions published by hostel management through IHMS circulars.

2.3 Room & Property Care:
Residents are personally liable for any willful damage, vandalism, or unauthorized alterations to hostel rooms, fixtures, furniture, or common amenities. Deductions for repairs will be made from refundable security deposits or billed directly.

2.4 Prohibited Items:
Possession or consumption of alcohol, tobacco, narcotics, illegal substances, weapons, fireworks, or unauthorized heavy electrical appliances (such as induction stoves or heaters) is strictly forbidden on hostel premises.`,
    applicableTo: 'STUDENT',
    order: 2,
  },
  {
    id: 'owner-terms',
    title: '3. Hostel Owner & Management Responsibilities',
    summary: 'Statutory compliance, safety standards, transparent billing, and management obligations of hostel owners.',
    content: `3.1 Listing Accuracy:
Hostel Owners warrant that all information published regarding room categories, bed capacities, amenities, tariffs, meal provisions, and policies is truthful, accurate, and kept up to date.

3.2 Safety & Habitability:
Management is solely responsible for maintaining physical premises in compliance with local municipal safety regulations, fire safety standards, hygienic sanitation, pest control, and emergency exits.

3.3 Security Deposits & Refund Integrity:
Hostel management agrees to process refundable caution deposits and fee refunds strictly in accordance with published policies, and disburse eligible funds within reasonable turnaround timelines without unlawful withholding.

3.4 Non-Discrimination Policy:
Management shall not practice discrimination against residents or applicants based on religion, caste, gender, sexual orientation, disability, origin, or ethnicity.`,
    applicableTo: 'OWNER',
    order: 3,
  },
  {
    id: 'payment-terms',
    title: '4. Fees, Billing, Payments & Refund Policy',
    summary: 'Payment processing rules, supported payment channels, automated receipts, transaction charges, and dispute handling.',
    content: `4.1 Payment Methods:
IHMS facilitates fee collection through integrated online payment gateways (Credit Cards, Debit Cards, Net Banking, Unified Payments Interface [UPI], and dynamic QR codes) as well as offline direct bank transfers (IMPS / NEFT / RTGS) verified by management.

4.2 Invoicing & Digital Receipts:
Every successful financial transaction recorded in IHMS automatically generates a verifiable, tamper-evident digital payment receipt with a unique receipt number, timestamp, and audit trail. Receipts remain accessible in the student portal and can be downloaded as PDF records.

4.3 Payment Gateway Fees & Taxes:
Online payment transactions may be subject to applicable banking charges, convenience fees, and goods and services tax (GST) levied by acquiring banks and payment gateway providers, which are clearly displayed prior to transaction confirmation.

4.4 Payment Disputes & Chargebacks:
In the event of double debits, transaction timeouts, or banking gateway failures, funds are reconciled in accordance with Reserve Bank of India (RBI) and National Payments Corporation of India (NPCI) turnaround time (TAT) standards (typically 3 to 7 business days). Any billing dispute between a student and hostel owner must be raised through the IHMS Support & Complaints portal.`,
    applicableTo: 'ALL',
    order: 4,
  },
  {
    id: 'account-security',
    title: '5. Account Credentials & Security Responsibilities',
    summary: 'Security protocols for user credentials, password policies, and confidentiality obligations.',
    content: `5.1 Credential Confidentiality:
Users (both Students and Owners) are exclusively responsible for maintaining the confidentiality of their login credentials, passwords, PINs, and multi-factor authentication codes.

5.2 Non-Transferability:
Accounts are non-transferable. You agree not to disclose your password or grant account access to any third party. Any action, transaction, or communication initiated under your login credentials shall be legally deemed to have been authorized by you.

5.3 Prompt Incident Reporting:
Users must immediately notify IHMS administration at ihmserp00@gmail.com if they suspect or identify any unauthorized access, compromised passwords, or security breaches relating to their account.`,
    applicableTo: 'ALL',
    order: 5,
  },
  {
    id: 'prohibited-activities',
    title: '6. Prohibited Activities & Platform Misuse',
    summary: 'Explicitly prohibited behaviors, cyber offenses, and zero-tolerance policy against reverse engineering or scraping.',
    content: `When accessing or utilizing the IHMS platform, you expressly agree not to engage in any of the following prohibited activities:

- Unauthorized Probing & Cyber Attacks: Attempting to probe, scan, reverse engineer, decompile, benchmark, attack, or test the vulnerability of the IHMS system, servers, or networks.
- Malicious Software: Introducing viruses, trojans, worms, logic bombs, or other malicious or technologically harmful code.
- Automated Scraping: Deploying spiders, crawlers, robots, or automated scraping scripts to extract application data without explicit written authorization.
- Fraud & Impersonation: Impersonating another person, creating false accounts, submitting fabricated UTR transaction numbers, or falsifying payment proofs.
- Harassing Communication: Using the complaints, messaging, or notification systems to broadcast defamatory, obscene, harassing, or unlawful material.`,
    applicableTo: 'ALL',
    order: 6,
  },
  {
    id: 'limitation-of-liability',
    title: '7. Limitation of Liability & Service Disclaimers',
    summary: 'Legal disclaimers regarding software availability, third-party services, physical property premises, and liability caps.',
    content: `7.1 "As Is" and "As Available":
The IHMS platform is provided on an "as is" and "as available" basis. While IHMS employs enterprise-grade high availability, data redundancy, and security measures, IHMS does not warrant that the service will be entirely uninterrupted, error-free, or free of network latency.

7.2 No Liability for Physical Premises or Hostels:
Under no circumstances shall IHMS, its directors, developers, or affiliates be liable for personal injury, theft, property loss, fire accidents, electrical damage, or disputes occurring physically on hostel premises. Such matters remain the sole and exclusive legal liability of the respective hostel owners and residents.

7.3 Maximum Liability Cap:
To the maximum extent permitted by applicable law, the cumulative aggregate liability of IHMS for any claims arising out of or relating to the platform shall not exceed the total software subscription fees actually paid by the user to IHMS in the preceding three (3) months.`,
    applicableTo: 'ALL',
    order: 7,
  },
  {
    id: 'termination',
    title: '8. Suspension, Termination & Platform Exit',
    summary: 'Grounds for immediate account suspension, deactivation protocols, and the user right to decline terms.',
    content: `8.1 Termination by Platform:
IHMS reserves the right to temporarily suspend or permanently terminate user accounts with or without notice upon:
- Breach of these Terms & Conditions or violation of hostel residency codes.
- Submission of fraudulent payment references, chargeback abuse, or malicious activity.
- Regulatory requirement, court order, or formal request from statutory law enforcement authorities.

8.2 Right to Decline & Account Exit:
Acceptance of these Terms & Conditions is mandatory to access the IHMS ERP and student portal. If you do not agree to these Terms, you must click "Decline / Exit", which will immediately terminate your active session, log you out of the platform, and prevent access to restricted areas.`,
    applicableTo: 'ALL',
    order: 8,
  },
  {
    id: 'governing-law',
    title: '9. Governing Law & Dispute Resolution',
    summary: 'Governing jurisdiction in Hyderabad, Telangana, India and arbitration mechanisms.',
    content: `9.1 Jurisdiction:
These Terms & Conditions and any disputes arising out of or related to IHMS shall be governed by and construed in accordance with the substantive laws of the Republic of India.

9.2 Exclusive Courts:
Subject to arbitration, any legal action or proceeding arising out of or relating to these Terms shall be instituted exclusively in the competent civil courts located in Hyderabad, State of Telangana, India.

9.3 Amicable Dispute Resolution:
In the event of any controversy, controversy claim, or disagreement, the parties agree to first endeavor in good faith to resolve the dispute amicably through informal discussions and mediation prior to commencing formal litigation.`,
    applicableTo: 'ALL',
    order: 9,
  },
  {
    id: 'contact-info',
    title: '10. Legal Contact & Grievance Redressal',
    summary: 'Official contact details for legal inquiries, compliance notices, and grievance communications.',
    content: `For legal notices, compliance queries, privacy inquiries, or grievance communications regarding these Terms & Conditions, you may contact:

Integrated Hostel Management System (IHMS)
Email: ihmserp00@gmail.com`,
    applicableTo: 'ALL',
    order: 10,
  },
];

/**
 * Combined list for backward compatibility with existing unit tests.
 */
export const TERMS_SECTIONS: TermsSection[] = DEFAULT_PLATFORM_TERMS_SECTIONS;

