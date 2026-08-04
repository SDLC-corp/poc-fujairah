import RawJson from '../RawJson'

const FAQS = [
  {
    q: 'How is an anchorage spot recommended?',
    a: 'Candidate spots are filtered by depth, LOA and zone clearance, then ranked on forecast occupancy and distance to the next service. Operators can always override.',
  },
  {
    q: 'Why is a vessel flagged as an incursion?',
    a: 'Its AIS position falls inside a polygon typed as restricted and it is not moored alongside. Moored vessels are treated as authorised.',
  },
  {
    q: 'How current is the vessel data?',
    a: 'The live feed refreshes every 30 seconds. This proof of concept uses a fixed snapshot bundled as static GeoJSON.',
  },
  {
    q: 'Can I export the occupancy forecast?',
    a: 'Yes — Reports → Templates → Hourly occupancy, then export as PDF or Excel.',
  },
]

const RESOURCES = [
  { name: 'Operator manual', meta: 'PDF · 4.2 MB' },
  { name: 'Anchorage assignment training', meta: 'Video · 18 min' },
  { name: 'API reference', meta: 'Web · v1' },
  { name: 'Release notes', meta: 'Web · updated 01 Aug' },
]

export default function HelpScreen() {
  return (
    <>
      <section className="panel">
        <h2>Frequently asked</h2>
        {FAQS.map((f) => (
          <details className="faq" key={f.q}>
            <summary>{f.q}</summary>
            <p className="muted">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="panel">
        <h2>Contact support</h2>
        <ul className="contact-list">
          <li>
            <span>
              <strong>Live chat</strong>
              <span className="muted">Mon–Sun, 24 h</span>
            </span>
            <span className="pill pill-moored">online</span>
          </li>
          <li>
            <span>
              <strong>ops-support@portoffujairah.ae</strong>
              <span className="muted">Response within 4 h</span>
            </span>
          </li>
          <li>
            <span>
              <strong>+971 9 228 8888</strong>
              <span className="muted">VTS control room</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Resources</h2>
        <ul className="option-list">
          {RESOURCES.map((r) => (
            <li key={r.name}>
              <button type="button">
                <span>
                  <strong>{r.name}</strong>
                  <span className="muted">{r.meta}</span>
                </span>
                <span className="option-check">↗</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Send feedback</h2>
        <textarea className="text-input" rows={3} placeholder="What could work better?" />
        <button type="button" className="primary-button">
          Submit feedback
        </button>
      </section>

      <RawJson
        label="GET /api/support/content"
        data={{ faqs: FAQS, resources: RESOURCES, supportHours: '24/7', slaHours: 4 }}
      />
    </>
  )
}
