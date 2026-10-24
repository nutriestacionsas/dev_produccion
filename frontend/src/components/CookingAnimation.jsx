import React, { useEffect } from 'react';
import { ChefHat, Utensils, Flame, CheckCircle2, Soup } from 'lucide-react';

export default function CookingAnimation({ isFinishing, onFinished }) {
  useEffect(() => {
    if (isFinishing) {
      // Play bell sound
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Quick jump for "ding" effect
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      } catch (e) {
        console.error("Audio API error", e);
      }

      // Close after delay
      const timer = setTimeout(() => {
        if (onFinished) onFinished();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFinishing, onFinished]);

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9999] flex flex-col items-center justify-center">
      {!isFinishing ? (
        <div className="relative flex flex-col items-center">
          {/* Flame background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange-500/20 rounded-full blur-[60px] animate-pulse"></div>
          
          <div className="relative z-10 flex gap-8 items-end mb-12">
            <Utensils className="w-16 h-16 text-slate-300 animate-[bounce_1s_infinite] origin-bottom -rotate-12" />
            <div className="relative flex flex-col items-center">
               <ChefHat className="w-24 h-24 text-white animate-[bounce_2s_infinite] z-20" />
               <Soup className="w-20 h-20 text-orange-400 mt-2 z-10 animate-pulse" />
               <Flame className="w-12 h-12 text-orange-500 absolute -bottom-6 animate-pulse" />
            </div>
            <Utensils className="w-16 h-16 text-slate-300 animate-[bounce_1.5s_infinite] origin-bottom rotate-12 scale-x-[-1]" />
          </div>
          
          <h2 className="text-3xl font-black text-white tracking-[0.2em] animate-pulse">
            PRODUCIENDO...
          </h2>
          <p className="text-orange-400 font-bold mt-4 text-sm tracking-[0.3em]">
            ENVIANDO A COCINA
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center animate-scale-up">
          <div className="w-28 h-28 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(16,185,129,0.6)]">
            <CheckCircle2 className="w-16 h-16 text-white" />
          </div>
          <h2 className="text-5xl font-black text-white tracking-[0.2em]">
            ¡ORDEN LISTA!
          </h2>
        </div>
      )}
    </div>
  );
}
