import { cn } from '@/lib/utils';

type LogoProps = {
  className?: string;
  /** Show “Sardor System Solutions” text */
  showWordmark?: boolean;
  compact?: boolean;
};

export function Logo({ className, showWordmark = true, compact = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <img
        src="/logo.png"
        alt=""
        decoding="async"
        className={cn(
          'shrink-0 object-contain object-left',
          compact ? 'h-8 w-auto max-h-8 rounded-full' : 'h-9 w-auto max-h-9 sm:h-10 sm:max-h-10 rounded-full',
        )}
      />
      {showWordmark && (
        <span
          className={cn(
            'font-heading font-semibold tracking-tight text-left leading-[1.1]',
            compact ? 'text-[0.9375rem]' : 'text-base sm:text-lg',
          )}
        >
          Sardor & Danila
          <span className="font-medium text-muted-foreground"> Systems</span>
        </span>
      )}
    </span>
  );
}
