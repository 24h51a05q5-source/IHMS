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

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'platform-description',
    title: '1. Platform & Service Description',
    summary: 'IHMS provides cloud-based ERP infrastructure for hostel operations and student residential management.',
    content: `Integrated Hostel Management System ("IHMS", "Platform", "we", "us", or "our") is an enterprise cloud-based software application engineered to streamline hostel administration, student residency, fee billing, room allocations, complaint tracking, and biometric attendance.

IHMS acts solely as a technology platform and enterprise resource planning ("ERP") provider facilitating communication, workflow management, and financial records between hostel management / property owners ("Owners", "Management") and enrolled residents / boarders ("Students", "Residents").

IHMS is not a real estate broker, landlord, residential hostel operator, or insurer. IHMS does not own, inspect, lease, manage, or operate physical hostel properties, nor does it guarantee the condition, safety, quality, or legality of any accommodation.`,
    applicableTo: 'ALL',
    order: 1,
  },
  {
    id: 'student-terms',
    title: '2. Student Residency Terms & Code of Conduct',
    summary: 'Binding residency terms, conduct rules, visitor guidelines, curfew compliance, and property care obligations for all students.',
    content: `All enrolled students and boarders utilizing the IHMS platform and residing in registered hostels agree to strictly abide by the following residency terms:

2.1 Rules of Hostel Stay & Compliance:
Students must adhere to all hostel regulations, standard operating procedures, and notices issued by hostel management and wardens through the IHMS announcement and communication portals.

2.2 Timely Fee Payments:
Students are obligated to pay all recurring accommodation, mess, utility, and maintenance dues on or before the specified due date as reflected in their IHMS student portal. Failure to settle invoices by the due date may attract late payment penalties, revocation of mess facilities, or suspension of room access.

2.3 Code of Conduct & Zero Tolerance:
- Harassment & Bullying: Ragging, verbal harassment, physical abuse, bullying, or intimidation of fellow residents, hostel staff, or management is strictly prohibited and subject to immediate eviction and statutory reporting under applicable anti-ragging legislation.
- Substance Abuse: Possession, distribution, consumption, or facilitation of alcohol, narcotics, contraband substances, or tobacco on hostel premises is strictly prohibited.
- Damage to Property & Vandalism: Students are jointly and severally liable for any damage caused to rooms, fixtures, furniture, electronic appliances, and common hostel amenities. Repair or replacement costs will be assessed and debited to the student's ledger.
- Unauthorized Guests & Curfew: Students must comply with prescribed entry/exit curfew hours and visitor admission protocols. Overnight hosting of non-registered guests without explicit warden approval via the IHMS visitor management system is strictly disallowed.

2.4 Mess & Dining Hall Rules:
Students must respect mess dining hours, maintain cleanliness, avoid food wastage, and adhere to meal token or attendance procedures logged on the platform.

2.5 Leave & Absence Protocols:
Any planned overnight absence or extended travel must be submitted in advance through the IHMS Leave Application portal and approved by the warden or authorized management before departure.`,
    applicableTo: 'STUDENT',
    order: 2,
  },
  {
    id: 'owner-terms',
    title: '3. Hostel Owner & Management Responsibilities',
    summary: 'Obligations of hostel owners regarding listing accuracy, safety standards, maintenance, privacy, and non-discrimination.',
    content: `Hostel owners, operators, administrators, and authorized management personnel using IHMS agree to uphold the highest operational standards:

3.1 Accuracy of Premises & Capacity Listings:
Owners warrant that all property data, room counts, bed capacities, pricing schedules, amenities, and photographs published on IHMS are truthful, accurate, and kept strictly up to date. Deliberate overbooking or deceptive capacity representations is a violation of these Terms.

3.2 Regulatory & Safety Compliance:
Owners must comply with all applicable local, municipal, state, and central laws, including:
- Fire safety equipment, emergency exit signage, and regular municipal fire NOC compliance.
- Structural stability, sanitary standards, potable water testing, and pest control certifications.
- Registration of commercial lodging and compliance with local police verification protocols for residents and staff.

3.3 Maintenance of Essential Facilities:
Owners are responsible for ensuring continuous availability of essential utilities (water supply, sanitation, electrical safety, CCTV in public areas, secure access controls) and resolving student grievances submitted through IHMS within industry-standard service level agreements (SLAs).

3.4 Fair Fee Collection & Transparent Refunds:
Owners must maintain transparent fee structures with zero hidden charges. Security deposits and advance rents must be accounted for accurately in IHMS financial ledgers, and refunds must be settled in full compliance with published hostel cancellation and checkout policies.

3.5 Student Data Privacy & Ethical Handling:
Student personal identification, guardian emergency contacts, academic records, and biometric logs stored in IHMS must be treated with strict confidentiality. Owners and staff are prohibited from selling, exporting, or sharing resident information with unauthorized third parties.

3.6 Non-Discrimination Policy:
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
Users must immediately notify IHMS administration at security@ihms.com if they suspect or identify any unauthorized access, compromised passwords, or security breaches relating to their account.`,
    applicableTo: 'ALL',
    order: 5,
  },
  {
    id: 'prohibited-activities',
    title: '6. Prohibited Activities & System Misuse',
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
    summary: 'Official contact details for legal inquiries, compliance notices, and grievance officers.',
    content: `For legal notices, compliance queries, privacy inquiries, or grievance redressal regarding these Terms & Conditions, you may contact our designated legal officer:

Grievance Redressal & Legal Cell
Integrated Hostel Management System (IHMS)
Address: Plot 42, Hitech City Main Road, Madhapur, Hyderabad, Telangana 500081, India
Legal Email: legal@ihms.com
General Support: support@ihms.com
Helpline: +91 98480 12345
Operating Hours: Monday – Saturday (09:30 AM to 06:30 PM IST)`,
    applicableTo: 'ALL',
    order: 10,
  },
];
