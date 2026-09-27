import ModerationDashboard from "@/components/ModerationDashboard";
// This shell has no private data. All queue, preview and action requests require
// verified Auth plus the current database role independently.
export default function Page() {
  return <ModerationDashboard />;
}
