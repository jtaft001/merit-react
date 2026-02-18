import admin from 'firebase-admin';
import serviceAccount from '../serviceAccountKey.json' assert { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function linkStudent() {
  const userEmail = 'jonathan.dayre.taft@gmail.com';
  const studentName = 'New User';

  try {
    const user = await admin.auth().getUserByEmail(userEmail);
    const studentQuery = await db.collection('students').where('name', '==', studentName).limit(1).get();

    if (studentQuery.empty) {
      console.log(`No student found with name "${studentName}"`);
      return;
    }

    const studentDoc = studentQuery.docs[0];
    await studentDoc.ref.update({ userId: user.uid });
    console.log(`Successfully linked student "${studentName}" to user "${userEmail}"`);

  } catch (error) {
    console.error('Error linking student:', error);
  }
}

linkStudent();
