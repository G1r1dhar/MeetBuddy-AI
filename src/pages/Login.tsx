import React, { useState, useEffect } from 'react';
import { Video, Mail, Lock, Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error, clearError, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => { clearError(); }, [email, password, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Successfully signed in!');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    }
  };

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
          className="absolute rounded-full bg-theme-accent/20 blur-[120px]"
          style={{
            width: '50vw', height: '50vw',
            top: '-15vw', left: '-10vw',
          }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full bg-theme-accent/10 blur-[100px]"
          style={{
            width: '40vw', height: '40vw',
            bottom: '-10vw', right: '-8vw',
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        {/* Grid overlay */}
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
            className="text-center mb-10"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Logo */}
            <motion.div className="flex justify-center mb-6" variants={itemVariants}>
              <div className="relative group">
                <motion.div
                  className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-theme-accent/30 to-theme-accent/10 blur-md"
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

            <motion.h1
              className="text-3xl font-extrabold tracking-tight mb-2 text-theme-text"
              variants={itemVariants}
            >
              <span className="text-theme-accent">Meet</span>
              <span>Buddy</span>
              <span className="bg-gradient-to-r from-theme-accent to-yellow-400 bg-clip-text text-transparent"> AI</span>
            </motion.h1>

            <motion.p
              className="text-sm font-medium tracking-widest uppercase text-theme-accent/70"
              variants={itemVariants}
            >
              Enter your workspace
            </motion.p>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="flex items-center gap-3 rounded-xl p-4 mb-6 bg-red-500/10 border border-red-500/20"
              >
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <p className="text-red-600 dark:text-red-200 text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Email */}
            <motion.div className="space-y-1.5" variants={itemVariants}>
              <label htmlFor="email" className="block text-sm font-medium ml-1 text-theme-accent/90">
                Email Address
              </label>
              <div className="relative group/input">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors text-theme-accent/50" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl text-theme-text placeholder-theme-text/40 transition-all outline-none bg-theme-accent/5 border border-theme-accent/20 focus:border-theme-accent/60 focus:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div className="space-y-1.5" variants={itemVariants}>
              <label htmlFor="password" className="block text-sm font-medium ml-1 text-theme-accent/90">
                Password
              </label>
              <div className="relative group/input">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors text-theme-accent/50" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3.5 rounded-xl text-theme-text placeholder-theme-text/40 transition-all outline-none bg-theme-accent/5 border border-theme-accent/20 focus:border-theme-accent/60 focus:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors focus:outline-none text-theme-accent/50 hover:text-theme-accent"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </motion.div>

            {/* Submit Button */}
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
                  <span className="tracking-widest text-sm uppercase">Authenticate</span>
                )}
              </motion.button>
            </motion.div>
          </motion.form>

          <motion.div
            className="mt-8 pt-6 text-center border-t border-theme-accent/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <p className="text-sm text-theme-text/60">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold transition-colors text-theme-accent hover:brightness-110"
              >
                Sign up
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
