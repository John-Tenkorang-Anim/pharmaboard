// Deployment branding. Each institution deployment uses its own API/database;
// this config deliberately does not claim to provide tenant isolation.
const discipline = (import.meta.env.VITE_PLATFORM_DISCIPLINE || "Pharmacy").trim();
const pharmacy = discipline.toLowerCase() === "pharmacy";
const engineering = /computer|engineering|software/i.test(discipline);
export const platform = {
  discipline,
  name: (
    import.meta.env.VITE_PLATFORM_NAME || (pharmacy ? "PharmaBoard" : `${discipline} Board`)
  ).trim(),
  logo: pharmacy ? "/pharm-logo.jpeg" : "",
  logoAlt: "Pharmaceutical Society of Ghana",
  forumName: pharmacy ? "RxForum" : "Discussion forum",
  learningTopics: pharmacy
    ? ["Clinical pharmacy", "Research", "Leadership", "Career development"]
    : engineering
      ? ["Software & systems", "Hardware & electronics", "Research", "Career development"]
      : [discipline, "Research", "Leadership", "Career development"],
};
