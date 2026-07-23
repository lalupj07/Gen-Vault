'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WELCOME_TOUR_STEPS, type WelcomeTourStep } from '@/lib/welcomeTour';

interface WelcomeTourProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(target?: string, active = true): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  const update = useCallback(() => {
    if (!target || !active) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const box = el.getBoundingClientRect();
    setRect({
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
    });
  }, [target, active]);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const id = window.setInterval(update, 250);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(id);
    };
  }, [update]);

  return rect;
}

function tooltipStyle(step: WelcomeTourStep, rect: Rect | null): React.CSSProperties {
  if (step.placement === 'center' || !rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: 420,
    };
  }

  const pad = 16;
  const cardWidth = 320;

  switch (step.placement) {
    case 'right':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + pad,
        transform: 'translateY(-50%)',
        maxWidth: cardWidth,
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: Math.max(pad, rect.left - cardWidth - pad),
        transform: 'translateY(-50%)',
        maxWidth: cardWidth,
      };
    case 'bottom':
      return {
        top: rect.top + rect.height + pad,
        left: Math.min(
          Math.max(pad, rect.left + rect.width / 2 - cardWidth / 2),
          window.innerWidth - cardWidth - pad
        ),
        maxWidth: cardWidth,
      };
    case 'top':
    default:
      return {
        top: Math.max(pad, rect.top - pad),
        left: Math.min(
          Math.max(pad, rect.left + rect.width / 2 - cardWidth / 2),
          window.innerWidth - cardWidth - pad
        ),
        transform: 'translateY(-100%)',
        maxWidth: cardWidth,
      };
  }
}

export default function WelcomeTour({ open, onComplete, onSkip }: WelcomeTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = WELCOME_TOUR_STEPS[stepIndex];
  const rect = useTargetRect(step.target, open);
  const isLast = stepIndex === WELCOME_TOUR_STEPS.length - 1;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const handleNext = () => {
    if (isLast) onComplete();
    else setStepIndex(i => i + 1);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Dim overlay with spotlight */}
      {rect ? (
        <motion.div
          key={step.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute border-2 border-cyber-cyan/50 pointer-events-none bg-transparent"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/72" />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="absolute z-[101] w-full px-4"
          style={tooltipStyle(step, rect)}
        >
          <div className="rounded-2xl border border-cyber-cyan/25 bg-vault-panel/95 backdrop-blur-xl shadow-glow-md p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyber-cyan" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-vault-muted">
                    Tour {stepIndex + 1} of {WELCOME_TOUR_STEPS.length}
                  </p>
                  <h3 className="text-sm font-semibold text-vault-light">{step.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onSkip}
                className="text-vault-muted hover:text-vault-light p-1 rounded-lg hover:bg-white/5"
                aria-label="Skip tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-vault-muted leading-relaxed mb-4">{step.description}</p>

            <div className="flex items-center gap-2 mb-4">
              {WELCOME_TOUR_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300',
                    i === stepIndex ? 'w-6 bg-cyber-cyan' : 'w-2 bg-vault-border',
                    i < stepIndex && 'bg-cyber-cyan/50'
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-vault-muted hover:text-vault-light transition-colors"
              >
                Skip tour
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyber-cyan to-cyber-blue text-vault-black hover:shadow-glow-sm"
              >
                {isLast ? 'Start Using GenVault' : 'Next'}
                {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
