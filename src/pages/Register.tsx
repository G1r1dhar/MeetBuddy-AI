import React, { useState, useEffect } from 'react';
import { Video, Mail, Lock, User as UserIcon, Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
  required?: boolean;
  hint?: string;
  rightAddon?: React.ReactNode;
}

function Field({ id, label, type, value, onChange, placeholder, icon, required, hint, rightAddon }: FieldProps) {
  return (
    <motion.div className="space-y-1.5" variants={itemVariants}>
      <label htmlFor={id} className="block text-sm font-medium ml-1 text-theme-accent/90">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-accent/50">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full py-3.5 rounded-xl text-theme-text placeholder-theme-text/40 transition-all outline-none bg-theme-accent/5 border border-theme-accent/20 focus:border-theme-accent/60 focus:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
          style={{
            paddingLeft: '3rem',
            paddingRight: rightAddon ? '3rem' : '1rem',
          }}
          placeholder={placeholder}
          required={required}
        />
        {rightAddon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">{rightAddon}</div>
        )}
      </div>
      {hint && <p className="text-xs ml-1 text-theme-accent/40">{hint}</p>}
    </motion.div>
  );
}

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { register, loading, error, clearError, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => {
    clearError();
    setLocalError(null);
  }, [name, email, password, confirmPassword, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    try {
      await register({ name, email, password, confirmPassword });
      toast.success('Account created successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    }
  };

  const displayError = localError || error;

  const eyeIcon = (show: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="transition-colors focus:outline-none text-theme-accent/50 hover:text-theme-accent"
    >
      {show ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  );

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-theme-bg transition-colors duration-300">
      {/* Animated background glows */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <motion.div
          className="absolute rounded-full bg-theme-accent/20 blur-[100px]"
          style={{
            width: '45vw', height: '45vw',
            top: '-12vw', right: '-8vw',
          }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full bg-theme-accent/15 blur-[90px]"
          style={{
            width: '35vw', height: '35vw',
            bottom: '-8vw', left: '-6vw',
          }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(var(--text-color) 1px, transparent 1px), linear-gradient(90deg, var(--text-color) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </motion.div>

      {/* Card */}
      <motion.div
        className="max-w-md w-full relative z-10"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="rounded-3xl shadow-2xl p-10 bg-theme-card/80 backdrop-blur-2xl border border-theme-accent/20 dark:shadow-[0_0_60px_rgba(234,179,8,0.08),0_25px_50px_rgba(0,0,0,0.6)] shadow-[0_0_40px_rgba(234,179,8,0.1)] transition-colors duration-300">
          <motion.div
            className="text-center mb-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Logo */}
            <motion.div className="flex justify-center mb-5" variants={itemVariants}>
              <div className="relative">
                <motion.div
                  className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-theme-accent/30 to-theme-accent/10 blur-sm"
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                />
                <motion.div
                  className="relative p-4 rounded-2xl flex items-center justify-center bg-theme-card border border-theme-accent/40 shadow-[0_0_30px_rgba(234,179,8,0.2)] dark:bg-black/50"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <Video
                    className="w-8 h-8 text-theme-accent drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]"
                  />
                </motion.div>
              </div>
            </motion.div>

            <motion.h1 className="text-3xl font-extrabold tracking-tight mb-2 text-theme-text" variants={itemVariants}>
              <span>Create </span>
              <span className="text-theme-accent">Account</span>
            </motion.h1>
            <motion.p
              className="text-sm font-medium tracking-widest uppercase text-theme-accent/70"
              variants={itemVariants}
            >
              Join MeetBuddy AI today
            </motion.p>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="flex items-center gap-3 rounded-xl p-4 mb-5 bg-red-500/10 border border-red-500/20"
              >
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <p className="text-red-600 dark:text-red-200 text-sm font-medium">{displayError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-5"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <Field
              id="name"
              label="Full Name"
              type="text"
              value={name}
              onChange={setName}
              placeholder="John Doe"
              icon={<UserIcon className="w-5 h-5" />}
              required
            />
            <Field
              id="email"
              label="Email Address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="name@company.com"
              icon={<Mail className="w-5 h-5" />}
              required
            />
            <Field
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              icon={<Lock className="w-5 h-5" />}
              hint="Must be at least 6 characters long."
              required
              rightAddon={eyeIcon(showPassword, () => setShowPassword(v => !v))}
            />
            <Field
              id="confirmPassword"
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="••••••••"
              icon={<Lock className="w-5 h-5" />}
              required
              rightAddon={eyeIcon(showConfirmPassword, () => setShowConfirmPassword(v => !v))}
            />

            <motion.div variants={itemVariants}>
              <motion.button
                type="submit"
                disabled={loading}
                className="relative w-full flex items-center justify-center py-3.5 px-4 rounded-xl font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)]"
                style={{
                  background: 'linear-gradient(90deg, #ca8a04, #EAB308, #FDE047, #EAB308, #ca8a04)',
                  backgroundSize: '200% auto',
                }}
                whileHover={!loading ? { scale: 1.02, boxShadow: '0 0 40px rgba(234,179,8,0.6)' } : {}}
                whileTap={!loading ? { scale: 0.98 } : {}}
                animate={{ backgroundPosition: ['0%', '100%', '0%'] }}
                transition={{ backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' } }}
              >
                {loading ? (
                  <Loader className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="tracking-widest text-sm uppercase">Create Account</span>
                )}
              </motion.button>
            </motion.div>
          </motion.form>

          <motion.div
            className="mt-7 pt-5 text-center border-t border-theme-accent/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <p className="text-sm text-theme-text/60">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold transition-colors text-theme-accent hover:brightness-110"
              >
                Sign in
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
