"use client";

import { CATEGORY_COLORS, FIELDS, fieldById } from "@/lib/fields";
import { computeAge } from "@/lib/age";

export type CardPerson = {
  displayName: string;
  gender: string;
  birthDate: string;
  age?: number;
  heightCm: number;
  bodyType?: string | null;
  profession?: string | null;
  education?: string | null;
  city: string;
  bio?: string | null;
  photos: { url: string; caption?: string }[];
  interests: string[];
  hobbies?: string[] | null;
  pronouns?: string | null;
  profileType?: string;
  settings?: {
    discoveryDistanceKm: number;
    minDesiredAge: number;
    maxDesiredAge: number;
    notificationsEnabled: boolean;
    profileVisibility: string;
    pausedAccount: boolean;
    genderPreferences: string[];
  };
  subscription?: {
    plan: string;
    paymentStatus: string;
    autoRenew: boolean;
    startDate?: string;
    endDate?: string;
  };
};

const GENDER_IT: Record<string, string> = {
  woman: "Donna",
  man: "Uomo",
  nonbinary: "Non binario",
  unspecified: "Non specificato",
};

export function ProfileCard({
  person,
  highlight,
  onHighlight,
  reveal = 99,
  compact,
}: {
  person: CardPerson;
  highlight?: string | null;
  onHighlight?: (id: string) => void;
  reveal?: number;
  compact?: boolean;
}) {
  const age = person.age ?? computeAge(person.birthDate);
  const photo = person.photos[0]?.url;
  const click = (id: string) => () => onHighlight?.(id);
  const on = (id: string) => highlight === id;
  const show = (n: number) => reveal >= n;

  return (
    <article className="profile-card">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={person.displayName} />
      ) : (
        <div style={{ height: 200, background: "#023430" }} />
      )}
      <div style={{ padding: "0.9rem 1rem 1.1rem" }}>
        {show(1) && (
          <button className="chip" data-on={String(on("displayName"))} onClick={click("displayName")} style={{ background: "transparent", color: "white", padding: 0, fontSize: compact ? "1.35rem" : "1.6rem" }}>
            {person.displayName}, {age}
          </button>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {show(2) && (
            <span className="chip" data-on={String(on("gender"))} onClick={click("gender")} style={{ background: CATEGORY_COLORS.identity.bg }}>
              {GENDER_IT[person.gender] ?? person.gender}
            </span>
          )}
          {show(3) && (
            <span className="chip" data-on={String(on("city"))} onClick={click("city")} style={{ background: "#00684A" }}>
              {person.city}
            </span>
          )}
          {show(4) && (
            <span className="chip" data-on={String(on("heightCm"))} onClick={click("heightCm")} style={{ background: "#023430" }}>
              {person.heightCm} cm
            </span>
          )}
          {show(5) && person.bodyType && (
            <span className="chip" data-on={String(on("bodyType"))} onClick={click("bodyType")} style={{ background: "#023430" }}>
              {person.bodyType}
            </span>
          )}
          {show(5) && person.pronouns && (
            <span className="chip" data-on={String(on("pronouns"))} onClick={click("pronouns")} style={{ background: "#00684A" }}>
              {person.pronouns}
            </span>
          )}
        </div>
        {show(6) && person.profession && (
          <p style={{ margin: "0.6rem 0 0", opacity: 0.9 }}>
            <button className="chip" data-on={String(on("profession"))} onClick={click("profession")} style={{ background: "transparent", color: "white" }}>
              {person.profession}
              {person.education ? ` · ${person.education}` : ""}
            </button>
          </p>
        )}
        {show(7) && person.bio && (
          <p style={{ margin: "0.45rem 0 0", opacity: 0.86, fontSize: "0.92rem" }}>
            <button className="chip" data-on={String(on("bio"))} onClick={click("bio")} style={{ background: "transparent", color: "white", textAlign: "left" }}>
              {person.bio}
            </button>
          </p>
        )}
        {show(8) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {person.interests.map((i) => (
              <span key={i} className="chip" data-on={String(on("interests"))} onClick={click("interests")} style={{ background: CATEGORY_COLORS.interests.bg, color: CATEGORY_COLORS.interests.fg }}>
                {i}
              </span>
            ))}
          </div>
        )}
        {show(9) && person.hobbies && person.hobbies.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {person.hobbies.map((i) => (
              <span key={i} className="chip" data-on={String(on("hobbies"))} onClick={click("hobbies")} style={{ background: "#00684A" }}>
                {i}
              </span>
            ))}
          </div>
        )}
        {show(10) && person.settings && (
          <div style={{ marginTop: 12, fontSize: "0.8rem", opacity: 0.9 }}>
            <button className="chip" data-on={String(on("discoveryDistance"))} onClick={click("discoveryDistance")} style={{ background: CATEGORY_COLORS.settings.bg, color: "#001E2B" }}>
              {person.settings.discoveryDistanceKm} km
            </button>{" "}
            <button className="chip" data-on={String(on("ageRange"))} onClick={click("ageRange")} style={{ background: CATEGORY_COLORS.settings.bg, color: "#001E2B" }}>
              {person.settings.minDesiredAge}–{person.settings.maxDesiredAge} anni
            </button>
            {person.subscription && (
              <button className="chip" data-on={String(on("plan"))} onClick={click("plan")} style={{ background: CATEGORY_COLORS.subscription.bg, color: "#001E2B", marginLeft: 6 }}>
                {person.subscription.plan}
              </button>
            )}
          </div>
        )}
        {person.photos.length > 1 && (
          <div className="kicker" style={{ marginTop: 10 }}>
            <button className="chip" data-on={String(on("photos"))} onClick={click("photos")} style={{ background: "#E3FCF7", color: "#023430" }}>
              {person.photos.length} foto
            </button>
          </div>
        )}
        {person.profileType === "eventOrganizer" && (
          <div className="kicker" style={{ marginTop: 8, color: "#00ED64" }}>Organizzatore eventi</div>
        )}
      </div>
    </article>
  );
}

export function MappingStrip({ highlight }: { highlight?: string | null }) {
  const field = highlight ? fieldById(highlight) : undefined;
  if (!field) {
    return <p className="kicker">Clicca un campo: profilo → tabella → path del documento.</p>;
  }
  const color = CATEGORY_COLORS[field.category];
  return (
    <div className="code" style={{ background: color.bg, color: color.fg, borderRadius: 12, padding: "0.55rem 0.7rem" }}>
      Campo «{field.label}» → {field.sql.table}.{field.sql.column}
      {field.sql.relation ? ` (${field.sql.relation})` : ""} → {field.mongo}
      {field.slide && field.slide !== `${field.sql.table}.${field.sql.column}` ? ` · slide ${field.slide}` : ""}
    </div>
  );
}

export { FIELDS };
