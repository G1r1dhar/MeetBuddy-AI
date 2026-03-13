import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'intro' | 'expand' | 'exit'>('intro');

  useEffect(() => {
    // Phase 1: Intro (logo appears) → Phase 2: Expand → Phase 3: Exit
    const t1 = setTimeout(() => setPhase('expand'), 1400);
    const t2 = setTimeout(() => setPhase('exit'), 2400);
    const t3 = setTimeout(() => onComplete(), 3200);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'exit' ? (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#050505' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          {/* Pulsing yellow radial glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(234,179,8,0.18) 0%, transparent 70%)',
            }}
            animate={{
              scale: phase === 'expand' ? [1, 1.25, 1.1] : 1,
              opacity: phase === 'expand' ? [0.5, 1, 0.8] : [0, 0.5],
            }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />

          {/* Floating particles */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${4 + (i % 4) * 3}px`,
                height: `${4 + (i % 4) * 3}px`,
                background:
                  i % 3 === 0
                    ? 'rgba(234,179,8,0.7)'
                    : i % 3 === 1
                    ? 'rgba(253,224,71,0.5)'
                    : 'rgba(161,120,0,0.4)',
                left: `${10 + (i * 7) % 80}%`,
                top: `${15 + (i * 11) % 70}%`,
              }}
              animate={{
                y: [0, -18, 0, 12, 0],
                x: [0, 8, -5, 3, 0],
                opacity: phase === 'expand' ? [0.2, 1, 0.6, 1, 0.3] : [0, 0.4],
                scale: phase === 'expand' ? [1, 1.4, 1] : 1,
              }}
              transition={{
                duration: 2.4 + (i % 3) * 0.6,
                delay: i * 0.08,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          {/* Grid lines */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(234,179,8,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(234,179,8,0.04) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'expand' ? 1 : 0 }}
            transition={{ duration: 0.8 }}
          />

          {/* Core content */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo ring */}
            <motion.div
              className="relative mb-8"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
            >
              {/* Outer spinning ring */}
              <motion.div
                className="absolute -inset-4 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 60%, rgba(234,179,8,0.8) 100%)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              {/* Second ring */}
              <motion.div
                className="absolute -inset-2 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 180deg, transparent 60%, rgba(253,224,71,0.5) 100%)',
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />

              {/* Icon container */}
              <motion.div
                className="relative w-24 h-24 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #1a1400 0%, #0a0a0a 100%)',
                  border: '2px solid rgba(234,179,8,0.6)',
                  boxShadow:
                    '0 0 40px rgba(234,179,8,0.4), 0 0 80px rgba(234,179,8,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
                animate={
                  phase === 'expand'
                    ? {
                        boxShadow: [
                          '0 0 40px rgba(234,179,8,0.4), 0 0 80px rgba(234,179,8,0.15)',
                          '0 0 70px rgba(234,179,8,0.7), 0 0 140px rgba(234,179,8,0.3)',
                          '0 0 40px rgba(234,179,8,0.4), 0 0 80px rgba(234,179,8,0.15)',
                        ],
                      }
                    : {}
                }
                transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse' }}
              >
                <Video
                  className="w-11 h-11"
                  style={{ color: '#EAB308', filter: 'drop-shadow(0 0 12px rgba(234,179,8,0.8))' }}
                />
              </motion.div>
            </motion.div>

            {/* Brand name */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
            >
              <motion.h1
                className="text-5xl font-black tracking-tight leading-none"
                animate={
                  phase === 'expand'
                    ? { textShadow: ['0 0 20px rgba(234,179,8,0.3)', '0 0 40px rgba(234,179,8,0.6)', '0 0 20px rgba(234,179,8,0.3)'] }
                    : {}
                }
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span style={{ color: '#EAB308' }}>Meet</span>
                <span style={{ color: '#ffffff' }}>Buddy</span>
                <span
                  style={{
                    background: 'linear-gradient(90deg, #EAB308, #FDE047)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {' '}AI
                </span>
              </motion.h1>

              <motion.p
                className="mt-3 text-sm font-medium tracking-[0.35em] uppercase"
                style={{ color: 'rgba(234,179,8,0.5)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                AI-Powered Meeting Intelligence
              </motion.p>
            </motion.div>

            {/* Loading bar */}
            <motion.div
              className="mt-12 relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div
                className="w-48 h-0.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(234,179,8,0.15)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #92650a, #EAB308, #FDE047)',
                    boxShadow: '0 0 10px rgba(234,179,8,0.8)',
                  }}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ delay: 0.8, duration: 1.4, ease: 'easeInOut' }}
                />
              </div>
              <motion.div
                className="absolute -top-1 right-0 w-2 h-2 rounded-full"
                style={{ background: '#FDE047', boxShadow: '0 0 8px #EAB308' }}
                initial={{ left: '0%' }}
                animate={{ left: '100%' }}
                transition={{ delay: 0.8, duration: 1.4, ease: 'easeInOut' }}
              />
            </motion.div>
          </div>

          {/* Corner accents */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
            <motion.div
              key={i}
              className={`absolute ${pos} w-16 h-16`}
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'expand' ? 0.6 : 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderTop: i < 2 ? '2px solid rgba(234,179,8,0.4)' : 'none',
                  borderBottom: i >= 2 ? '2px solid rgba(234,179,8,0.4)' : 'none',
                  borderLeft: i % 2 === 0 ? '2px solid rgba(234,179,8,0.4)' : 'none',
                  borderRight: i % 2 !== 0 ? '2px solid rgba(234,179,8,0.4)' : 'none',
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
