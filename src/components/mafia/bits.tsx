import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isPast, isToday, parseISO } from "date-fns";
import { CalendarDays, Check, Clock, Flag, UserRound, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  PRIORITIES,
  STATUSES,
  initials,
  personName,
  teamQuery,
  type Profile,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/data";

export function PersonAvatar({ person, size = 28 }: { person?: Profile | null | undefined; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-accent-foreground"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={personName(person)}
    >
      {person?.avatar_url ? (
        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : person ? (
        initials(person)
      ) : (
        <UserRound className="h-1/2 w-1/2 text-muted-foreground" />
      )}
    </span>
  );
}

export function useTeamMap() {
  const { data = [] } = useQuery(teamQuery);
  return { team: data, byId: new Map(data.map((p) => [p.id, p])) };
}

/** Searchable teammate picker — assignees are always chosen from the directory. */
export function PersonPicker({
  value,
  onChange,
  compact,
  exclude = [],
  placeholder = "Assign",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
  exclude?: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const { team, byId } = useTeamMap();
  const current = value ? byId.get(value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-2 rounded-full text-sm transition hover:bg-muted",
            compact ? "p-0.5" : "border border-border bg-card px-2 py-1",
          )}
        >
          <PersonAvatar person={current} size={compact ? 24 : 22} />
          {!compact && <span className={cn(!current && "text-muted-foreground")}>{current ? personName(current) : placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Search teammates…" />
          <CommandList>
            <CommandEmpty>No teammate found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>
                  <X className="mr-2 h-4 w-4" /> Unassign
                </CommandItem>
              )}
              {team.filter((p) => !exclude.includes(p.id)).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.full_name ?? ""} ${p.email}`}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <PersonAvatar person={p} size={24} />
                  <div className="ml-2 min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{personName(p)}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                  </div>
                  {p.id === value && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = STATUSES.find((x) => x.value === status)!;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", s.tone)}>{s.label}</span>;
}

export function StatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()}><StatusPill status={value} /></button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        {STATUSES.map((s) => (
          <button key={s.value} onClick={() => onChange(s.value)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
            <StatusPill status={s.value} />
            {s.value === value && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (p: TaskPriority) => void }) {
  const cur = PRIORITIES.find((p) => p.value === value)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted", cur.tone)}>
          <Flag className="h-3.5 w-3.5" /> {value === "none" ? "" : cur.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        {PRIORITIES.map((p) => (
          <button key={p.value} onClick={() => onChange(p.value)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", p.tone)}>
            <Flag className="h-3.5 w-3.5" /> {p.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function dueTone(due: string | null, done: boolean) {
  if (!due || done) return "text-muted-foreground";
  const d = parseISO(due);
  if (isToday(d)) return "text-warning";
  if (isPast(d)) return "text-destructive";
  return "text-muted-foreground";
}

export function DuePicker({
  value,
  onChange,
  done = false,
  timeValue,
  onTimeChange,
}: {
  value: string | null;
  onChange: (d: string | null) => void;
  done?: boolean;
  timeValue?: string | null | undefined;
  onTimeChange?: ((t: string | null) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const showTime = onTimeChange !== undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-muted", dueTone(value, done))}>
          <CalendarDays className="h-3.5 w-3.5" />
          {value ? (isToday(parseISO(value)) ? "Today" : format(parseISO(value), "MMM d")) : ""}
          {showTime && timeValue ? <span className="text-muted-foreground">· {timeValue.slice(0, 5)}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          onSelect={(d) => { onChange(d ? format(d, "yyyy-MM-dd") : null); if (!showTime) setOpen(false); }}
        />
        {showTime && (
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <label className="text-xs text-muted-foreground" htmlFor="due-time">Time</label>
            <input
              id="due-time"
              type="time"
              value={timeValue?.slice(0, 5) ?? ""}
              onChange={(e) => onTimeChange(e.target.value || null)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
            />
            {timeValue && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onTimeChange(null)}>
                Clear
              </button>
            )}
          </div>
        )}
        {value && (
          <button className="w-full border-t border-border py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => { onChange(null); onTimeChange?.(null); setOpen(false); }}>
            Clear date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
