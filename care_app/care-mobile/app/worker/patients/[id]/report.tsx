import { useLocalSearchParams } from "expo-router";
import { PatientReport } from "@/PatientReport";

export default function WorkerPatientReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PatientReport patientId={id} showHealth />;
}
