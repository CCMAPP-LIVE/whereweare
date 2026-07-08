import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { londonToday } from "@/lib/time";
import NavBar from "@/components/NavBar";
import BirthdaysList, { type Birthday } from "@/components/BirthdaysList";

export const dynamic = "force-dynamic";

export default async function BirthdaysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("birthdays")
    .select("id, name, month, day, year, notes")
    .order("month", { ascending: true })
    .order("day", { ascending: true });

  const birthdays: Birthday[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    month: r.month,
    day: r.day,
    year: r.year,
    notes: r.notes,
  }));

  return (
    <>
      <NavBar />
      <BirthdaysList initialBirthdays={birthdays} today={londonToday()} />
    </>
  );
}
