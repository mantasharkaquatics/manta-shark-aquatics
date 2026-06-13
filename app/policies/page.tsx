'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

// ── DATA ────────────────────────────────────────────────────────────────────

const SWIM_RULES = [
  {
    num: 1,
    title: 'Student Registration',
    items: [
      'All students must complete the registration process before participating in classes.',
    ],
  },
  {
    num: 2,
    title: 'Course Purchase Options',
    items: [
      'New students may purchase a single trial lesson (priced proportionally).',
      'To continue lessons, students must purchase a lesson package. Single-session purchases are not available for long-term training students.',
    ],
  },
  {
    num: 3,
    title: 'Cancellation and Rescheduling',
    items: [
      'Cancellations or changes must be notified at least 24 hours before the lesson starts.',
      'Cancellations within 24 hours will not be refunded or rescheduled.',
    ],
  },
  {
    num: 4,
    title: 'Swimming Safety Rules',
    items: [
      'Students should not enter the pool before the class begins.',
      'Students may arrive 10 minutes early and wait in the designated poolside area.',
      'If a student enters the water before the official start of the lesson, all related safety responsibilities will be borne by the student and their guardian. The school assumes no liability.',
    ],
  },
  {
    num: 5,
    title: 'Late Arrival and Absence Policy',
    items: [
      'Students may join the lesson at any time, but the session duration will not be extended.',
      'If a student is absent, it will be considered a forfeit, and no rescheduling or refund will be provided.',
    ],
  },
  {
    num: 6,
    title: 'Health and Medical Statement',
    items: [
      'Students must ensure they are in good health for swimming. Any special conditions (e.g., epilepsy, asthma) must be reported to the coach and management in advance.',
      'If a student feels unwell (e.g., fever, contagious illness), they should not attend class to avoid affecting others.',
    ],
  },
  {
    num: 7,
    title: 'Class Arrangements and Weather Conditions',
    items: [
      'In cases of extreme weather (e.g., thunderstorms, typhoons), we will decide whether to cancel classes and notify students accordingly.',
      'We reserve the final decision. If a class is canceled, it may be rescheduled, and the session will be retained for future use.',
      'If a student cannot attend for personal reasons, the standard cancellation policy applies.',
    ],
  },
  {
    num: 8,
    title: 'Pool Usage Rules',
    items: [
      'Students must wear appropriate swimwear (no cotton clothing) and a swim cap, following pool regulations.',
      'Running, pushing, or jumping from heights in the pool area is strictly prohibited for safety reasons.',
    ],
  },
  {
    num: 9,
    title: 'Parent and Spectator Guidelines',
    items: [
      'Accompanying and Spectating: To maintain class focus, parents may watch from designated areas. However, loud talking or giving instructions near the pool is not allowed, as it may disrupt the lesson.',
      'Parent-Coach Communication: Parents with questions may schedule a discussion with the coach after class. Please do not interrupt the lesson or distract students and instructors.',
    ],
  },
  {
    num: 10,
    title: 'Photography and Privacy',
    items: [
      'The swim school may take photos and videos of class activities for teaching records or promotional purposes.',
      'If students or parents do not consent, please inform us at the time of registration.',
    ],
  },
]

const PRIVACY_SECTIONS = [
  {
    num: 1,
    title: 'Information We Collect',
    intro: 'We may collect the following types of personal information:',
    subsections: [
      {
        label: 'Student Information',
        items: [
          'Name',
          'Age / Date of Birth',
          'Gender (if applicable)',
          'Contact details (email, phone number)',
          'Health conditions (if any special needs or medical requirements)',
        ],
      },
      {
        label: 'Payment Information',
        items: [
          'Credit/debit card details (processed through third-party payment services such as Stripe)',
          'Transaction history',
        ],
      },
      {
        label: 'Other Relevant Information',
        items: [
          'Communication records (emails, inquiry forms)',
          'Browsing behavior on our website or app (if applicable)',
        ],
      },
    ],
  },
  {
    num: 2,
    title: 'How We Use Your Information',
    intro: 'We use the information we collect to:',
    items: [
      'Provide swim lessons and related services (such as registration, class scheduling, notifications)',
      'Process payments and invoices (all transactions are handled by third-party payment providers)',
      'Offer customer support (responding to inquiries and service updates)',
      'Improve our website and services (analyzing feedback and user behavior)',
    ],
    note: 'We do not sell or rent your personal information to third parties.',
  },
  {
    num: 3,
    title: 'How We Protect Your Information',
    intro: 'We implement security measures to protect your personal data, including:',
    items: [
      'Encryption of payment information to ensure secure transactions (processed through Stripe)',
      'Limited access to data so only authorized staff can access student and payment information',
      'Regular security updates to prevent unauthorized access',
    ],
  },
  {
    num: 4,
    title: 'Third-Party Service Providers',
    intro: 'We may share necessary data with trusted third-party service providers, including:',
    items: [
      'Payment processing services (Stripe)',
      'Email services (Resend)',
      'SMS notifications (Twilio)',
      'Website analytics (if applicable)',
    ],
    note: 'These third parties have their own privacy policies, and we recommend reviewing their terms.',
  },
  {
    num: 5,
    title: 'Your Rights',
    intro: 'You have the right to:',
    items: [
      'Access and update your personal information (contact us for changes)',
      'Request deletion of your data (unless legally required to retain transaction records)',
      'Withdraw consent (unsubscribe from marketing emails using the link provided)',
    ],
  },
  {
    num: 6,
    title: 'Cookies & Tracking Technologies',
    items: [
      'If our website uses cookies or tracking technologies, we will inform you and obtain your consent.',
    ],
  },
  {
    num: 7,
    title: 'Changes to This Privacy Policy',
    items: [
      'We may update this policy from time to time to reflect legal or service changes. Significant updates will be communicated via email or website notifications.',
    ],
  },
  {
    num: 8,
    title: 'Contact Us',
    intro: 'For any privacy-related questions, please contact us:',
    contact: true,
  },
]

const SGV_SECTIONS = [
  {
    num: 1,
    title: 'Absence & Credit Policy',
    subtitle: 'Applicable to All Students',
    items: [
      {
        label: 'Notice Requirement',
        text: 'If a student needs to be absent, notice must be given at least 24 hours in advance.',
      },
      {
        label: 'Credit Conversion',
        text: 'If notified in time, the missed class will be converted into credit: Single Session ($384 / 8 classes): $48 credit per class · Four-Session Plan ($1,305 / 32 classes): $41 credit per class',
      },
      {
        label: 'Late Notice',
        text: 'If notice is given less than 24 hours in advance (or absent without notice), the class is considered used. No credit or make-up will be provided.',
      },
      {
        label: 'Exceptions',
        text: 'In cases of serious illness or emergency, please contact us for a case-by-case review.',
      },
    ],
  },
  {
    num: 2,
    title: 'Make-up Class & Holiday Policy',
    items: [
      {
        label: 'Monday & Wednesday Swap',
        text: 'Students enrolled in either the Monday or Wednesday session are permitted to attend the other session (Monday/Wednesday) for make-up classes.',
      },
      {
        label: 'Public Holidays',
        text: 'In the event of a public holiday, students are responsible for self-arranging their make-up sessions on other available dates.',
      },
    ],
  },
  {
    num: 3,
    title: 'Withdrawal & Refund Policy',
    subsections: [
      {
        label: 'Single Session Enrollment ($384)',
        items: [
          'Once the session has started, no cash refund will be provided.',
          'Unused classes can be converted into credit at $48 per class.',
        ],
      },
      {
        label: 'Promotional Package Enrollment ($1,305)',
        items: [
          'Completed Classes: Charged at the standard rate of $48 per class and deducted from the total payment.',
          'Current Session: Any unattended classes (started but not completed) may be converted into credit at $48 per class (Total credit for the session cannot exceed $326.25).',
          'Future Sessions: Any full sessions not yet started will be refunded at the promotional rate of $326.25 per session.',
          'Note: The combined total of credit and refund cannot exceed the original payment of $1,305.',
        ],
      },
    ],
  },
  {
    num: 4,
    title: 'Important Terms',
    items: [
      { label: 'Expiration', text: 'All credits must be used before December 31, 2026.' },
      { label: 'Usage', text: 'Credits can be applied to any Manta Shark Aquatics program.' },
      { label: 'Restrictions', text: 'Credits are non-refundable, non-transferable, and non-extendable.' },
    ],
    note: 'By registering, you acknowledge and agree to the policies stated above.',
  },
]

const TABS = [
  { id: 'rules', label: 'Swim Lesson Rules', sublabel: '& Safety Policy', color: '#4a90c4' },
  { id: 'privacy', label: 'Privacy Policy', sublabel: 'Last Updated: March 4, 2025', color: '#4caf72' },
  { id: 'sgv', label: 'SGV Mini Swim Team', sublabel: 'Absence & Refund Policy', color: GOLD },
]

// ── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function SectionCard({ num, title, color, children }: {
  num: number; title: string; color: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: '14px',
      border: '1px solid #eef1f7',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(26,52,128,0.05)',
      marginBottom: '16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '18px 24px',
        borderBottom: '1px solid #f0f4f8',
      }}>
        <span style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700, flexShrink: 0,
        }}>
          {num}
        </span>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: NAVY, margin: 0 }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: '18px 24px' }}>
        {children}
      </div>
    </div>
  )
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: color, flexShrink: 0, marginTop: '7px',
        display: 'inline-block',
      }} />
      <span style={{ fontSize: '13.5px', color: '#4a5a7a', lineHeight: 1.7 }}>{text}</span>
    </div>
  )
}

function LabeledItem({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color }}>{label}: </span>
      <span style={{ fontSize: '13.5px', color: '#4a5a7a', lineHeight: 1.7 }}>{text}</span>
    </div>
  )
}

function SubsectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
      textTransform: 'uppercase', color: '#8a9ab8',
      marginTop: '14px', marginBottom: '8px',
    }}>
      {label}
    </div>
  )
}

function IntroText({ text }: { text: string }) {
  return (
    <p style={{ fontSize: '13.5px', color: '#6a7a9a', marginBottom: '10px', lineHeight: 1.6 }}>
      {text}
    </p>
  )
}

// ── TAB CONTENT ──────────────────────────────────────────────────────────────

function SwimRulesContent() {
  const color = '#4a90c4'
  return (
    <div>
      <div style={{
        background: `${color}10`, border: `1px solid ${color}25`,
        borderRadius: '12px', padding: '16px 20px', marginBottom: '28px',
      }}>
        <p style={{ fontSize: '13.5px', color: '#4a5a7a', lineHeight: 1.7, margin: 0 }}>
          Please carefully read the following course notice. By registering, you acknowledge that you have read, understood, and agreed to comply with the terms below.
        </p>
      </div>
      {SWIM_RULES.map((sec) => (
        <SectionCard key={sec.num} num={sec.num} title={sec.title} color={color}>
          {sec.items.map((item, i) => <BulletItem key={i} text={item} color={color} />)}
        </SectionCard>
      ))}
      <p style={{ fontSize: '13px', color: '#8a9ab8', textAlign: 'center', marginTop: '8px' }}>
        Please ensure that you have read and understood all terms of this course notice.
      </p>
    </div>
  )
}

function PrivacyContent() {
  const color = '#4caf72'
  return (
    <div>
      <div style={{
        background: `${color}10`, border: `1px solid ${color}25`,
        borderRadius: '12px', padding: '16px 20px', marginBottom: '28px',
      }}>
        <p style={{ fontSize: '13.5px', color: '#4a5a7a', lineHeight: 1.7, margin: 0 }}>
          Welcome to Manta Shark Aquatics! We value your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, and protect your data when you use our services.
        </p>
      </div>
      {PRIVACY_SECTIONS.map((sec) => (
        <SectionCard key={sec.num} num={sec.num} title={sec.title} color={color}>
          {sec.intro && <IntroText text={sec.intro} />}
          {sec.subsections?.map((sub) => (
            <div key={sub.label}>
              <SubsectionLabel label={sub.label} />
              {sub.items.map((item, i) => <BulletItem key={i} text={item} color={color} />)}
            </div>
          ))}
          {sec.items?.map((item, i) => <BulletItem key={i} text={item} color={color} />)}
          {sec.note && (
            <p style={{ fontSize: '13px', color: '#8a9ab8', marginTop: '10px', fontStyle: 'italic' }}>
              {sec.note}
            </p>
          )}
          {sec.contact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '13.5px', color: '#4a5a7a' }}>📍 Manta Shark Aquatics</div>
              <div style={{ fontSize: '13.5px', color: '#4a5a7a' }}>📧 mantasharkaquatics@mantasharkaquatics.com</div>
              <div style={{ fontSize: '13.5px', color: '#4a5a7a' }}>📞 909-323-9573</div>
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  )
}

function SgvContent() {
  const color = GOLD
  return (
    <div>
      <div style={{
        background: `${color}12`, border: `1px solid ${color}30`,
        borderRadius: '12px', padding: '16px 20px', marginBottom: '28px',
      }}>
        <p style={{ fontSize: '13.5px', color: '#4a5a7a', lineHeight: 1.7, margin: 0 }}>
          The following policies apply to the <strong>Manta Shark Aquatics Mini Swim Team (SGV)</strong> program. By registering, you acknowledge and agree to all terms stated below.
        </p>
      </div>

      {/* Section 1 */}
      <SectionCard num={1} title={SGV_SECTIONS[0].title} color={color}>
        <SubsectionLabel label={SGV_SECTIONS[0].subtitle!} />
        {SGV_SECTIONS[0].items!.map((item: any, i: number) => (
          <LabeledItem key={i} label={item.label} text={item.text} color={color} />
        ))}
      </SectionCard>

      {/* Section 2 */}
      <SectionCard num={2} title={SGV_SECTIONS[1].title} color={color}>
        {SGV_SECTIONS[1].items!.map((item: any, i: number) => (
          <LabeledItem key={i} label={item.label} text={item.text} color={color} />
        ))}
      </SectionCard>

      {/* Section 3 */}
      <SectionCard num={3} title={SGV_SECTIONS[2].title} color={color}>
        {SGV_SECTIONS[2].subsections!.map((sub: any) => (
          <div key={sub.label}>
            <SubsectionLabel label={sub.label} />
            {sub.items.map((item: string, i: number) => (
              <BulletItem key={i} text={item} color={color} />
            ))}
          </div>
        ))}
      </SectionCard>

      {/* Section 4 */}
      <SectionCard num={4} title={SGV_SECTIONS[3].title} color={color}>
        {SGV_SECTIONS[3].items!.map((item: any, i: number) => (
          <LabeledItem key={i} label={item.label} text={item.text} color={color} />
        ))}
        <p style={{ fontSize: '13px', color: '#8a9ab8', marginTop: '14px', fontStyle: 'italic' }}>
          {SGV_SECTIONS[3].note}
        </p>
      </SectionCard>
    </div>
  )
}

// ── PAGE ────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState('rules')
  const activeColor = TABS.find(t => t.id === activeTab)?.color || GOLD

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      <Navbar />

      {/* ── HERO ── */}
      <div style={{
        background: NAVY, position: 'relative', overflow: 'hidden',
        padding: 'clamp(80px,10vw,100px) clamp(24px,5vw,72px) clamp(32px,4vw,48px)',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '10px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
            Policies & Terms
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(24px,3.2vw,40px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.1, marginBottom: '12px',
          }}>
            Policies &{' '}
            <em style={{ color: GOLD, fontStyle: 'italic' }}>Terms</em>
          </h1>
          <p style={{
            fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.7, maxWidth: '480px',
          }}>
            Everything you need to know about our class rules, privacy practices, and program-specific policies.
          </p>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ background: NAVY, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          maxWidth: '900px', margin: '0 auto',
          padding: '0 clamp(24px,5vw,72px)',
          display: 'flex', gap: '4px',
          overflowX: 'auto',
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '14px 20px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: `3px solid ${isActive ? tab.color : 'transparent'}`,
                  transition: 'border-color 0.2s',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{
                  fontSize: '13px', fontWeight: 700,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  transition: 'color 0.2s',
                }}>
                  {tab.label}
                </span>
                <span style={{
                  fontSize: '10px', color: isActive ? tab.color : 'rgba(255,255,255,0.3)',
                  transition: 'color 0.2s', marginTop: '2px',
                }}>
                  {tab.sublabel}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ background: '#f0f4f8', minHeight: '600px', padding: 'clamp(32px,5vw,56px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Tab label */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', color: activeColor, marginBottom: '6px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeColor, display: 'inline-block' }} />
              {TABS.find(t => t.id === activeTab)?.label}
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: NAVY,
            }}>
              {activeTab === 'rules' && 'Course Guidelines and Safety Notice'}
              {activeTab === 'privacy' && 'Privacy Policy'}
              {activeTab === 'sgv' && 'Class Absence, Make-up & Withdrawal Policy'}
            </h2>
          </div>

          {activeTab === 'rules' && <SwimRulesContent />}
          {activeTab === 'privacy' && <PrivacyContent />}
          {activeTab === 'sgv' && <SgvContent />}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>
    </div>
  )
}
