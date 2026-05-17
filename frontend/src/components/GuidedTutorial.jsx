import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

const steps = [
  {
    tab: 'buy',
    target: '[data-tour="app-hero"]',
    title: 'Start at the draw desk',
    body: 'The top band summarizes the private-ticket workflow and keeps the primary path one click away.',
  },
  {
    tab: 'buy',
    target: '[data-tour="demo-controls"]',
    title: 'Prepare a judge-ready run',
    body: 'Reset the state or seed known tickets and a revealed draw when you need a reliable end-to-end demo.',
  },
  {
    tab: 'buy',
    target: '[data-tour="proof-transparency"]',
    title: 'Show what is real',
    body: 'This panel separates proof mode, contract compilation, deployment, network, and parameter availability.',
  },
  {
    tab: 'buy',
    target: '[data-tour="tab-navigation"]',
    title: 'Move through the workflow',
    body: 'Buy a ticket, run the public draw, then submit the winner proof from these three tabs.',
  },
  {
    tab: 'buy',
    target: '[data-tour="buy-form"]',
    title: 'Commit a hidden number',
    body: 'Enter a ticket number and optional nickname. The app stores a public commitment while keeping the number private.',
  },
  {
    tab: 'buy',
    target: '[data-tour="proof-output"]',
    title: 'Keep the private receipt',
    body: 'After purchase, the ticket ID, proof hash, and private nonce appear here for the claim step.',
  },
  {
    tab: 'draw',
    target: '[data-tour="draw-actions"]',
    title: 'Run the live draw',
    body: 'Refresh the public commit board or run a draw when tickets are ready.',
  },
  {
    tab: 'draw',
    target: '[data-tour="randomness-story"]',
    title: 'Explain randomness clearly',
    body: 'The demo states its current randomness source and the production path for oracle or VRF-backed draws.',
  },
  {
    tab: 'draw',
    target: '[data-tour="audit-timeline"]',
    title: 'Review the public audit trail',
    body: 'Ticket commitments, draw reveals, and winner proofs appear as timestamped public events.',
  },
  {
    tab: 'proof',
    target: '[data-tour="claim-form"]',
    title: 'Reveal only the winner proof',
    body: 'Use the original ticket data and nonce to prove the winner without exposing non-winning tickets.',
  },
]

function GuidedTutorial({ open, onClose, setCurrentTab }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const step = steps[stepIndex]
  const progress = useMemo(() => `${stepIndex + 1} / ${steps.length}`, [stepIndex])

  useEffect(() => {
    if (!open) return
    setCurrentTab(step.tab)
  }, [open, setCurrentTab, step.tab])

  useLayoutEffect(() => {
    if (!open) return undefined

    let frameId = 0

    const measure = () => {
      const target = document.querySelector(step.target)
      if (!target) {
        setTargetRect(null)
        return
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      frameId = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect()
        setTargetRect({
          top: Math.max(rect.top - 8, 8),
          left: Math.max(rect.left - 8, 8),
          width: rect.width + 16,
          height: rect.height + 16,
        })
      })
    }

    const timeoutId = window.setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step.target])

  if (!open) return null

  const isLast = stepIndex === steps.length - 1

  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0))
  const goNext = () => {
    if (isLast) {
      onClose()
      setStepIndex(0)
      return
    }
    setStepIndex((index) => index + 1)
  }
  const skip = () => {
    onClose()
    setStepIndex(0)
  }

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {targetRect ? <div className="tour-spotlight" style={targetRect} /> : <div className="tour-backdrop" />}

      <div className="tour-card">
        <div className="tour-card-topline">
          <span className="badge-pill">GUIDED TOUR</span>
          <span>{progress}</span>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-controls">
          <button className="tertiary-button" type="button" onClick={skip}>
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Skip</span>
          </button>
          <div className="tour-step-buttons">
            <button className="secondary-button" type="button" onClick={goBack} disabled={stepIndex === 0}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back</span>
            </button>
            <button className="primary-button" type="button" onClick={goNext}>
              {isLast ? <Check className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              <span>{isLast ? 'Finish' : 'Next'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidedTutorial