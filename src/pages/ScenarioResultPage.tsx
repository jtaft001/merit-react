import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { saveAttempt } from '../services/attemptsService';

type Student = {
  id: string;
  name: string;
  email?: string;
  className?: string;
  status?: string;
  [key: string]: unknown;
};

type ScenarioResultPageProps = {
  currentScenarioId: string;
  currentScenarioTitle: string;
  currentScore: number;
};

async function fetchStudents(): Promise<Student[]> {
  const colRef = collection(db, 'students');
  const q = query(colRef, orderBy('name'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;

    const name = typeof data['name'] === 'string' ? (data['name'] as string) : '';
    const email = typeof data['email'] === 'string' ? (data['email'] as string) : undefined;
    const className = typeof data['className'] === 'string' ? (data['className'] as string) : undefined;
    const status = typeof data['status'] === 'string' ? (data['status'] as string) : undefined;

    return {
      id: doc.id,
      ...data,
      name,
      email,
      className,
      status,
    } as Student;
  });
}

function ScenarioResultPage({ currentScenarioId, currentScenarioTitle, currentScore }: ScenarioResultPageProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStudents()
      .then(setStudents)
      .catch((err) => {
        console.error('Error loading students', err);
        alert('Could not load students');
      });
  }, []);

  const selectedStudent: Student | null = students.find((s) => s.id === selectedStudentId) || null;

  async function handleSaveResult() {
    if (!selectedStudentId) {
      alert('Pick a student first.');
      return;
    }
    setSaving(true);
    try {
      const passed = typeof currentScore === 'number' ? currentScore >= 80 : false;

      await saveAttempt({
        studentId: selectedStudentId,
        studentName: selectedStudent ? selectedStudent.name : '',
        scenarioId: currentScenarioId,
        scenarioTitle: currentScenarioTitle,
        score: currentScore,
        passed,
      });

      alert('Result saved.');
    } catch (err) {
      console.error('Error saving attempt', err);
      alert('Could not save attempt.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Scenario Result</h2>
      <p>
        Scenario: {currentScenarioTitle} ({currentScenarioId})
      </p>
      <p>Score: {String(currentScore)}</p>

      <div style={{ marginTop: '1rem' }}>
        <label>
          Student:
          <select
            value={selectedStudentId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedStudentId(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button onClick={handleSaveResult} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? 'Saving...' : 'Save result'}
      </button>
    </div>
  );
}

export default ScenarioResultPage;
