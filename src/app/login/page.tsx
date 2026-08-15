"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // ------------------------------------------------------------
  // GOOGLE OAUTH HANDLER
  // ------------------------------------------------------------

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);

    try {
      const { error } =
        await supabase.auth.signInWithOAuth({
          provider: 'google',

          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          'Unable to continue with Google.'
      );

      setIsGoogleLoading(false);
    }
  };

  // ------------------------------------------------------------
  // EMAIL / PASSWORD HANDLER
  // ------------------------------------------------------------

  const handleAuth = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isSignUp) {
        const { error } =
          await supabase.auth.signUp({
            email,
            password,

            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

        if (error) {
          throw error;
        }

        alert(
          'Success! Check your email or try logging in if auto-confirm is enabled.'
        );

        setIsSignUp(false);
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          throw error;
        }

        router.push('/');
      }
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          'Authentication failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* ------------------------------------------------------ */}
      {/* BACKGROUND DECORATION                                  */}
      {/* ------------------------------------------------------ */}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[420px] h-[420px] rounded-full bg-amber-100/50 blur-3xl" />
        <div className="absolute -bottom-48 -left-48 w-[520px] h-[520px] rounded-full bg-slate-200/60 blur-3xl" />
      </div>

      {/* ------------------------------------------------------ */}
      {/* MAIN CONTAINER                                         */}
      {/* ------------------------------------------------------ */}

      <div className="relative w-full max-w-[440px]">
        {/* Brand */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-[20px] bg-white border border-slate-200 shadow-sm mb-4">
            <span className="text-2xl">
              🏗️
            </span>
          </div>

          <h1 className="text-[30px] leading-tight font-medium tracking-tight text-slate-900">
            Civil
            <span className="text-amber-500">
              GPT
            </span>
          </h1>

          <p className="mt-2 text-[14px] text-slate-500">
            AI-powered structural engineering
            workspace
          </p>
        </div>

        {/* ---------------------------------------------------- */}
        {/* AUTH CARD                                            */}
        {/* ---------------------------------------------------- */}

        <div className="bg-white border border-slate-200 rounded-[30px] shadow-[0_12px_40px_rgba(15,23,42,0.07)] overflow-hidden">
          <div className="p-7 sm:p-8">
            {/* Heading */}
            <div className="mb-7">
              <h2 className="text-[22px] font-medium tracking-tight text-slate-900">
                {isSignUp
                  ? 'Create your workspace'
                  : 'Welcome back'}
              </h2>

              <p className="mt-1.5 text-[13px] text-slate-500">
                {isSignUp
                  ? 'Create your CivilGPT account to get started.'
                  : 'Sign in to continue to your engineering workspace.'}
              </p>
            </div>

            {/* Error */}
            {errorMessage && (
              <div className="mb-5 px-4 py-3 rounded-[16px] border border-red-200 bg-red-50 text-[13px] leading-relaxed text-red-700">
                {errorMessage}
              </div>
            )}

            {/* ------------------------------------------------ */}
            {/* GOOGLE BUTTON                                    */}
            {/* ------------------------------------------------ */}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={
                isGoogleLoading ||
                isLoading
              }
              className="w-full h-[50px] rounded-[18px] border border-slate-200 bg-white hover:bg-[#f8fafc] active:bg-[#f1f5f9] text-slate-700 text-[14px] font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isGoogleLoading ? (
                <span className="animate-spin text-lg">
                  ⏳
                </span>
              ) : (
                <>
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />

                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />

                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />

                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>

                  Continue with Google
                </>
              )}
            </button>

            {/* ------------------------------------------------ */}
            {/* DIVIDER                                          */}
            {/* ------------------------------------------------ */}

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />

              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                or
              </span>

              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* ------------------------------------------------ */}
            {/* EMAIL FORM                                       */}
            {/* ------------------------------------------------ */}

            <form
              onSubmit={handleAuth}
              className="space-y-4"
            >
              {/* Email */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder="engineer@company.com"
                  className="w-full h-[50px] px-4 rounded-[16px] bg-[#f8fafc] border border-slate-200 text-[14px] text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Password
                </label>

                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  placeholder="••••••••"
                  className="w-full h-[50px] px-4 rounded-[16px] bg-[#f8fafc] border border-slate-200 text-[14px] text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={
                  isLoading ||
                  isGoogleLoading
                }
                className="w-full h-[50px] mt-2 rounded-[18px] bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white text-[14px] font-medium transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <span className="animate-spin text-lg">
                    ⏳
                  </span>
                ) : isSignUp ? (
                  'Create Account'
                ) : (
                  'Sign In with Email'
                )}
              </button>
            </form>

            {/* ------------------------------------------------ */}
            {/* LOGIN / SIGNUP TOGGLE                            */}
            {/* ------------------------------------------------ */}

            <div className="mt-6 text-center text-[13px] text-slate-500">
              {isSignUp
                ? 'Already have an account?'
                : "Don't have an account?"}

              <button
                type="button"
                onClick={() => {
                  setIsSignUp(
                    !isSignUp
                  );
                  setErrorMessage(
                    null
                  );
                }}
                className="ml-1.5 font-medium text-amber-600 hover:text-amber-700 transition-colors focus:outline-none"
              >
                {isSignUp
                  ? 'Sign In'
                  : 'Sign Up'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-[11px] text-slate-400">
            CivilGPT can make mistakes. Verify
            critical structural calculations against
            applicable IS Codes.
          </p>
        </div>
      </div>
    </div>
  );
}