type Props = {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
};

export function InventorySectionPlaceholder({ eyebrow, title, description, items }: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-6">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">{eyebrow}</div>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-300">{description}</p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
