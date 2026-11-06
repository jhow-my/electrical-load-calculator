import React, { useState, useEffect, useRef } from 'react';

export interface NumericInputProps {
  value: number | undefined | null;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  fallbackValue?: number;
  selectOnFocus?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  id?: string;
  autoFocus?: boolean;
}

/**
 * NumericInput provides smooth, unhindered number editing.
 * Solves browser number-input clamping and premature formatting bugs:
 * - Allows clearing the field and entering intermediate decimals (e.g. "0", "0.", "0.5")
 * - Does not inject unwanted digits or auto-clamp on every keystroke
 * - Live-updates parent when the number is valid and within bounds
 * - Safely clamps to min/max on blur or Enter key
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  allowDecimals = true,
  fallbackValue,
  selectOnFocus = true,
  className = '',
  placeholder,
  disabled = false,
  title,
  'aria-label': ariaLabel,
  id,
  autoFocus = false,
}) => {
  const [localVal, setLocalVal] = useState<string>(() =>
    value !== undefined && value !== null && !isNaN(value) ? String(value) : ''
  );
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from props ONLY when the input is not currently focused by the user
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(
        value !== undefined && value !== null && !isNaN(value) ? String(value) : ''
      );
    }
  }, [value, isFocused]);

  const getDecimalsCount = (val: number): number => {
    const s = String(val);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  };

  const stepDecimals = step ? getDecimalsCount(step) : (allowDecimals ? 2 : 0);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (selectOnFocus) {
      // Use setTimeout so the selection is not cleared by subsequent mouseup events
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
        }
      }, 10);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Validation regex
    const validPattern = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (!validPattern.test(raw)) {
      return;
    }

    setLocalVal(raw);

    // If completely empty, negative sign, or trailing decimal (e.g., "0."), wait for further input
    if (raw === '' || raw === '-' || raw === '.' || raw.endsWith('.')) {
      return;
    }

    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      return;
    }

    // Live update parent if within bounds (or if bounds not specified)
    const isMinOk = min === undefined || parsed >= min;
    const isMaxOk = max === undefined || parsed <= max;

    if (isMinOk && isMaxOk) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);

    let num: number;
    if (localVal === '' || localVal === '-' || localVal === '.') {
      num = fallbackValue !== undefined ? fallbackValue : (min ?? 0);
    } else {
      const parsed = parseFloat(localVal);
      if (isNaN(parsed)) {
        num = fallbackValue !== undefined ? fallbackValue : (min ?? 0);
      } else {
        num = parsed;
        if (min !== undefined && num < min) {
          num = min;
        }
        if (max !== undefined && num > max) {
          num = max;
        }
      }
    }

    // Format to clean decimal display
    const formatted = stepDecimals > 0 ? parseFloat(num.toFixed(stepDecimals)) : Math.round(num);
    setLocalVal(String(formatted));
    onChange(formatted);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFloat(localVal) || (min ?? 0);
      let next = current + step;
      if (max !== undefined && next > max) {
        next = max;
      }
      const rounded = stepDecimals > 0 ? parseFloat(next.toFixed(stepDecimals)) : Math.round(next);
      setLocalVal(String(rounded));
      onChange(rounded);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFloat(localVal) || (min ?? 0);
      let next = current - step;
      if (min !== undefined && next < min) {
        next = min;
      }
      const rounded = stepDecimals > 0 ? parseFloat(next.toFixed(stepDecimals)) : Math.round(next);
      setLocalVal(String(rounded));
      onChange(rounded);
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      value={localVal}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
    />
  );
};
