import { ClubForm } from "@/components/admin/club-form";

export default function NuevoClubPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Nuevo Club</h1>
      <p className="text-text-secondary mb-8">Registrar un nuevo club en la plataforma</p>
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <ClubForm />
      </div>
    </div>
  );
}
