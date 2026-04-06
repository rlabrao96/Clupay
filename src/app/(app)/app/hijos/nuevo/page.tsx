import { KidForm } from "@/components/app/kid-form";

export default function NuevoHijoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text">Agregar Hijo</h1>
        <p className="text-text-secondary text-sm">Registra los datos de tu hijo</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <KidForm />
      </div>
    </div>
  );
}
