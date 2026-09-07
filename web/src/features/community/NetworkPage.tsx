import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Users, MapPin, ArrowUpRight, UserRound, Check, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { VerificationChip } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import { useDirectory, useProfile, useSetFollow } from "./api";

function ProfilePreview({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { data, isLoading, error } = useProfile(id);
  const follow = useSetFollow();
  return <Modal open={!!id} onClose={onClose} title="Profile preview">
    {isLoading ? <SkeletonList rows={3}/> : data ? <div>
      <div className="flex items-center gap-4"><Avatar name={data.profile.display_name} size="xl" verification={data.profile.verification_state}/><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{data.profile.display_name}</h2><p className="mt-1 text-sm capitalize text-muted">{data.profile.practice_area || data.profile.account_kind}</p>{data.profile.region_code && <p className="mt-2 flex items-center gap-1 text-xs text-faint"><MapPin size={13}/>{data.profile.region_code}</p>}</div></div>
      <div className="mt-5"><VerificationChip state={data.profile.verification_state}/></div>
      <div className="my-6 grid grid-cols-3 rounded-xl bg-slate-50 p-4 text-center">{Object.entries(data.stats).map(([label,value])=><div key={label}><strong className="block text-lg">{value}</strong><span className="text-xs capitalize text-muted">{label}</span></div>)}</div>
      <ErrorBanner error={follow.error}/><div className="flex flex-wrap gap-3"><Button disabled={follow.isPending} variant={data.viewer_follows ? "secondary" : "primary"} onClick={()=>follow.mutate({userId:data.profile.id,on:!data.viewer_follows})}>{data.viewer_follows ? <Check size={15}/> : <Plus size={15}/>} {data.viewer_follows ? "Following" : "Follow"}</Button><Link to={`/people/${data.profile.id}`}><Button variant="secondary">View full profile <ArrowUpRight size={15}/></Button></Link></div>
      <p className="mt-4 text-xs leading-5 text-faint">Follow to see this colleague’s posts in your Following feed.</p>
    </div> : <ErrorBanner error={error}/>}
  </Modal>;
}
export function NetworkPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(term);
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<string>();
  useEffect(() => { const timer = setTimeout(() => {setDebounced(term);setParams(term ? {q:term} : {}, {replace:true});},250);return ()=>clearTimeout(timer); }, [term,setParams]);
  const { data, isLoading, error } = useDirectory(debounced);
  const others = (data?.items ?? []).filter(p=>p.id!==user?.id && (kind==="all" || p.account_kind===kind));
  return <AppShell>
    <header className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-700">Your professional community</p><h1 className="text-3xl font-semibold tracking-tight">My network</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Get to know the people behind the profession. Explore profiles, find shared interests and follow colleagues you want to learn from.</p></header>
    <div className="mb-6 flex flex-wrap items-center gap-4"><label className="relative min-w-[200px] max-w-xl flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"/><input aria-label="Search network" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search by name…" className="w-full rounded-lg border border-hairline bg-white py-3 pl-10 pr-4 text-sm focus-visible:outline-accent-600"/></label><select aria-label="Professional role" value={kind} onChange={e=>setKind(e.target.value)} className="rounded-lg border border-hairline bg-white px-3 py-3 text-sm"><option value="all">All professionals</option><option value="pharmacist">Pharmacists</option><option value="student">Students</option><option value="organisation">Organisations</option></select></div>
    <ErrorBanner error={error}/>
    {isLoading ? <SkeletonList rows={5}/> : others.length ? <><p className="mb-4 text-xs text-faint" role="status">Showing {others.length} profiles{data?.items.length===30 ? " · Refine your search to find more colleagues" : ""}</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{others.map(person=><article key={person.id} className="social-card flex min-w-0 flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><Link to={`/people/${person.id}`} aria-label={`View ${person.display_name}'s profile`}><Avatar name={person.display_name} size="lg" verification={person.verification_state}/></Link><span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] capitalize text-muted">{person.account_kind}</span></div>
      <h2 className="break-words text-base font-semibold leading-6"><Link className="hover:text-accent-700" to={`/people/${person.id}`}>{person.display_name}</Link></h2>
      <p className="mt-1 text-sm capitalize text-muted">{person.practice_area || (person.account_kind==="student" ? "Pharmacy student" : person.account_kind==="organisation" ? "Professional organisation" : "Pharmacist")}</p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-faint"><MapPin size={13}/>{person.region_code || "Location not added"}</p>
      <div className="mt-3"><VerificationChip state={person.verification_state}/></div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-5"><Button size="sm" variant="secondary" onClick={()=>setSelected(person.id)}><UserRound size={14}/>Quick view</Button><Link className="flex items-center gap-1 text-xs font-medium text-accent-700" to={`/people/${person.id}`}>Full profile <ArrowUpRight size={14}/></Link></div>
    </article>)}</div></> : <EmptyState icon={<Users className="size-6"/>} title="No colleagues found" description="Try a different name or professional role."/>}
    <ProfilePreview key={selected ?? "closed"} id={selected} onClose={()=>setSelected(undefined)}/>
  </AppShell>;
}
