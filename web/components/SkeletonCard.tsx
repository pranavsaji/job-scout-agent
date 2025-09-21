export default function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 shadow-sm bg-white animate-pulse">
      <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-3/5 bg-gray-200 rounded mb-1" />
      <div className="h-3 w-2/5 bg-gray-200 rounded" />
      <div className="h-20 bg-gray-100 rounded mt-3" />
      <div className="flex gap-2 mt-4">
        <div className="h-8 w-20 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  );
}
