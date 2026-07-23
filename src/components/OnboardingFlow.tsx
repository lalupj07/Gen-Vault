'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Lock, Fingerprint, Key, Smartphone, CheckCircle2,
  ArrowRight, Sparkles, Cpu, Globe, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import RecoveryCodesSetup from './RecoveryCodesSetup';
import { COMPANY, PRODUCT } from '@/lib/company';

interface OnboardingProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to GenVault',
    subtitle: 'Offline-First Secure Authentication',
    description: `Military-grade encryption meets elegant design. Your digital identity, stored locally and protected by ${COMPANY.name}.`,
    icon: Shield,
    color: '#00e5ff',
  },
  {
    id: 'encryption',
    title: 'Local Encryption',
    subtitle: 'AES-256-GCM Protected Vault',
    description: 'Your vault is encrypted with AES-256-GCM and Argon2id key derivation. All data stays on your device - zero cloud dependencies.',
    icon: Lock,
    color: '#7c4dff',
  },
  {
    id: 'biometric',
    title: 'Multi-Factor Unlock',
    subtitle: 'Password, PIN, or biometrics',
    description:
      'Layered security with master password, PIN, and optional fingerprint or face unlock. Your vault, your unlock method.',
    icon: Fingerprint,
    color: '#00e676',
  },
  {
    id: 'features',
    title: 'Complete OTP Support',
    subtitle: 'TOTP & HOTP (RFC 6238 & 4226)',
    description: 'Full support for time-based and counter-based OTP codes. QR code scanning, manual entry, and import from other authenticators.',
    icon: Key,
    color: '#3d5afe',
  },
  {
    id: 'recovery_codes',
    title: 'Recovery Codes',
    subtitle: 'One-Time Account Recovery',
    description: 'Generate high-entropy recovery codes to reset your password if locked out. Store them offline — each code works once.',
    icon: Shield,
    color: '#ff6b6b',
  },
  {
    id: 'ready',
    title: 'Vault Ready',
    subtitle: 'Your Offline Vault is Initialized',
    description: 'All cryptographic systems are ready. Next, a short welcome tour will guide you through the main interface.',
    icon: CheckCircle2,
    color: '#00e676',
  },
];

function CryptoPatternBackground() {
  const [nodes, setNodes] = useState<Array<{ x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    const generated = Array(30).fill(0).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
    }));
    setNodes(generated);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {nodes.map((node, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-cyber-cyan/30"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [0.5, 1.5, 0.5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: node.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingFlow({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (step.id === 'recovery_codes') {
      setShowRecoveryCodes(true);
    } else if (isLast) {
      setLoading(true);
      setTimeout(() => onComplete(), 1500);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleRecoveryCodesComplete = () => {
    setShowRecoveryCodes(false);
    setCurrentStep(prev => prev + 1);
  };

  const handleRecoveryCodesSkip = () => {
    setShowRecoveryCodes(false);
    setCurrentStep(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 bg-vault-black flex items-center justify-center z-50 overflow-hidden">
      <CryptoPatternBackground />

      {/* Ambient glow */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
        animate={{
          background: [
            `radial-gradient(circle, ${step.color}40, transparent)`,
          ],
        }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative z-10 max-w-lg w-full mx-auto px-6 pb-10">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-12 justify-center">
          {steps.map((s, i) => (
            <motion.div
              key={s.id}
              className="h-1 rounded-full overflow-hidden"
              style={{ width: i === currentStep ? 32 : 16 }}
              animate={{ width: i === currentStep ? 32 : 16 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-colors duration-500',
                  i <= currentStep ? 'bg-cyber-cyan' : 'bg-vault-border'
                )}
              />
            </motion.div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="text-center"
          >
            {/* Icon */}
            <motion.div
              className="relative mx-auto mb-8 w-24 h-24"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            >
              <div
                className="absolute inset-0 rounded-3xl opacity-20 blur-xl"
                style={{ background: step.color }}
              />
              <div
                className="relative w-full h-full rounded-3xl flex items-center justify-center border"
                style={{
                  background: `${step.color}10`,
                  borderColor: `${step.color}30`,
                }}
              >
                <Icon className="w-10 h-10" style={{ color: step.color }} />
              </div>

              {/* Orbiting dots */}
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{ background: step.color, opacity: 0.5 }}
                  animate={{
                    x: Math.cos((i * 2 * Math.PI) / 3) * 50,
                    y: Math.sin((i * 2 * Math.PI) / 3) * 50,
                    opacity: [0.2, 0.6, 0.2],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 0.5,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </motion.div>

            {/* Text */}
            <motion.p
              className="text-xs uppercase tracking-[0.3em] text-vault-muted mb-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {step.subtitle}
            </motion.p>

            <motion.h1
              className="text-3xl font-bold text-vault-light mb-4 tracking-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              {step.title}
            </motion.h1>

            <motion.p
              className="text-sm text-vault-muted leading-relaxed max-w-md mx-auto mb-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              {step.description}
            </motion.p>

            {/* Crypto badge */}
            {!isLast && (
              <motion.div
                className="flex items-center justify-center gap-4 mb-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {[
                  { icon: Cpu, label: 'AES-256-GCM' },
                  { icon: Key, label: 'Argon2id' },
                  { icon: Zap, label: 'TOTP' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-vault-border/30"
                  >
                    <item.icon className="w-3 h-3 text-vault-muted" />
                    <span className="text-[10px] text-vault-muted font-mono">{item.label}</span>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex flex-col items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300',
                  'bg-gradient-to-r from-cyber-cyan to-cyber-blue text-vault-black',
                  'hover:shadow-glow-md disabled:opacity-50'
                )}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                {loading ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-vault-black/30 border-t-vault-black rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    Initializing Vault...
                  </>
                ) : isLast ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Enter GenVault
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>

              {!isLast && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(steps.length - 1)}
                  className="text-xs text-vault-muted/70 hover:text-vault-muted transition-colors py-1"
                >
                  Skip onboarding
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Recovery Codes Modal */}
      <AnimatePresence>
        {showRecoveryCodes && (
          <RecoveryCodesSetup
            onComplete={handleRecoveryCodesComplete}
            onCancel={handleRecoveryCodesSkip}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
