import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = 'md',
}) => {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`animate-pulse bg-gray-200 ${roundedClasses[rounded]} ${className}`}
      style={style}
    />
  );
};

// Pre-built skeleton patterns
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = ''
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        height={16}
        width={i === lines - 1 ? '75%' : '100%'}
        rounded="sm"
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow p-6 space-y-4 ${className}`}>
    <Skeleton height={24} width="40%" rounded="sm" />
    <SkeletonText lines={2} />
    <div className="flex gap-2 pt-2">
      <Skeleton height={32} width={80} rounded="md" />
      <Skeleton height={32} width={80} rounded="md" />
    </div>
  </div>
);

export const SkeletonTableRow: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
  <tr className="border-b border-gray-100">
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="px-6 py-4">
        <Skeleton height={16} width={i === 1 ? '80%' : '60%'} rounded="sm" />
      </td>
    ))}
  </tr>
);

export const SkeletonActivityItem: React.FC = () => (
  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
    <div className="flex-1 space-y-2">
      <Skeleton height={16} width="70%" rounded="sm" />
      <Skeleton height={12} width="30%" rounded="sm" />
    </div>
    <Skeleton height={24} width={70} rounded="full" />
  </div>
);

export const SkeletonStatCard: React.FC = () => (
  <div className="bg-white rounded-lg shadow p-4 space-y-2">
    <Skeleton height={14} width="60%" rounded="sm" />
    <Skeleton height={32} width="40%" rounded="sm" />
    <Skeleton height={12} width="80%" rounded="sm" />
  </div>
);

export default Skeleton;
