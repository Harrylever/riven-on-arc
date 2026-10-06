'use client';
import { cn } from '@/lib/utils';
import { motion, SpringOptions, useSpring, useTransform } from 'motion/react';
import { useEffect, useMemo } from 'react';

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
  as?: 'span' | 'div' | 'p' | 'strong';
};

export function AnimatedNumber({
  value,
  className,
  springOptions,
  as = 'span',
}: AnimatedNumberProps) {
  const MotionComponent = useMemo(() => motion.create(as), [as]);

  const spring = useSpring(value, springOptions);
  const display = useTransform(spring, (current) =>
    Math.round(current).toLocaleString()
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return (
    <MotionComponent className={cn('tabular-nums', className)}>
      {display}
    </MotionComponent>
  );
}
