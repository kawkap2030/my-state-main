import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import Button from './Button';

const TourGuide = ({ steps, isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetStyle, setTargetStyle] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    const current = steps[currentStep];
    const element = document.querySelector(current.target);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const updatePosition = () => {
        const rect = element.getBoundingClientRect();
        setTargetStyle({
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        });
      };

      // Delay to allow scrolling to finish
      setTimeout(updatePosition, 300);
      updatePosition();

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    } else {
      const t = setTimeout(() => {
        setTargetStyle({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 150,
          width: 0,
          height: 0,
        });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [currentStep, isOpen, steps]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
      setCurrentStep(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const stepInfo = steps[currentStep];

  // Calculate Popover Position to keep it on screen
  let popoverTop = '50%';
  let popoverLeft = '50%';
  let transform = 'translate(-50%, -50%)';

  if (targetStyle.width > 0) {
    popoverTop = targetStyle.top + targetStyle.height + 16;
    popoverLeft = targetStyle.left;
    transform = 'none';
    
    // Prevent rendering off-screen vertically
    if (popoverTop > window.innerHeight - 200) {
        popoverTop = targetStyle.top - 200; 
        if (popoverTop < 16) {
            popoverTop = window.innerHeight / 2 - 100;
        }
    }

    // Prevent rendering off-screen horizontally
    if (popoverLeft > window.innerWidth - 340) {
        popoverLeft = window.innerWidth - 340;
    }
    if (popoverLeft < 16) {
        popoverLeft = 16;
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none" style={{ direction: 'rtl' }}>
      {/* Dark overlay with cutout using clip-path */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-all duration-300"
        style={{
          clipPath: targetStyle.width ? `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${targetStyle.left}px ${targetStyle.top}px,
            ${targetStyle.left}px ${targetStyle.top + targetStyle.height}px,
            ${targetStyle.left + targetStyle.width}px ${targetStyle.top + targetStyle.height}px,
            ${targetStyle.left + targetStyle.width}px ${targetStyle.top}px,
            ${targetStyle.left}px ${targetStyle.top}px
          )` : 'none'
        }}
      />
      
      {/* Highlight Box */}
      {targetStyle.width > 0 && (
        <div 
          className="absolute border-2 border-[var(--color-primary)] rounded-xl transition-all duration-300 pointer-events-none"
          style={{
            top: targetStyle.top,
            left: targetStyle.left,
            width: targetStyle.width,
            height: targetStyle.height,
            boxShadow: '0 0 0 4px rgba(6, 182, 212, 0.2)'
          }}
        />
      )}

      {/* Popover */}
      <div 
        className="absolute bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-5 pointer-events-auto transition-all duration-300 w-80 animate-in zoom-in-95"
        style={{
          top: popoverTop,
          left: popoverLeft,
          transform: transform,
        }}
      >
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-md font-black text-[var(--color-primary)]">{stepInfo.title}</h3>
          <button onClick={() => { onClose(); setCurrentStep(0); }} className="text-slate-400 hover:text-red-500 bg-[var(--color-bg)] rounded-full p-1 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm font-bold text-slate-600 mb-6 leading-relaxed">
          {stepInfo.content}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            {currentStep + 1} / {steps.length}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-xs px-2 py-1" onClick={handlePrev} disabled={currentStep === 0}>
              <ChevronRight size={14} className="ml-1" />
              السابق
            </Button>
            <Button size="sm" variant="primary" className="text-xs px-3 py-1" onClick={handleNext}>
              {currentStep === steps.length - 1 ? (
                <>إنهاء <Check size={14} className="mr-1" /></>
              ) : (
                <>التالي <ChevronLeft size={14} className="mr-1" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourGuide;
