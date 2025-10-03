import axios from 'axios';
import AppError from '../utils/AppError';

const AZURE_FACE_ENDPOINT = process.env.AZURE_FACE_ENDPOINT;
const AZURE_FACE_KEY = process.env.AZURE_FACE_KEY;
const PERSON_GROUP_ID = process.env.PERSON_GROUP_ID;

if (!AZURE_ENDPOINT || !AZURE_KEY)
  throw new AppError('Missing AZURE_FACE_ENDPOINT or AZURE_FACE_KEY');

const azureHeaders = (extra = {}) => ({
  headers: {
    'Ocp-Apim-Subscription-Key': AZURE_FACE_KEY,
    ...extra,
  },
});

export const ensurePersonGroup = async () => {
  try {
    await axios.get(
      `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}`,
      azureHeaders()
    );
  } catch (error) {
    if (error.response && error.response.status === 404) {
      axios.put(
        `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}`,
        {
          name: PERSON_GROUP_ID,
          recognitionModel: 'recognition_04',
        },
        azureHeaders({ 'Content-type': 'application/json' })
      );
    } else {
      throw error;
    }
  }
};

export const detectFaces = async buffer => {
  const url = `${AZURE_FACE_ENDPOINT}/face/v1.0/detect?returnFaceId=true&returnFaceLandmarks=false&recognitionModel=recognition_04`;
  const res = await axios.post(
    url,
    buffer,
    azureHeaders({ 'Content-type': 'application/octet-stream' })
  );
  console.log('detected face: ', res.data);
  return res.data;
};

export const createPerson = async (name = 'no name') => {
  const url = `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}/persons`;
  const res = await axios.post(
    url,
    { name },
    azureHeaders({ 'Content-type': 'application/json' })
  );

  console.log('created Person id: ', res.data.personId);
  return res.data.personId;
};

export const addFaceToPerson = async (personId, buffer) => {
  const url = `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}/persons/${personId}/persistedFaces`;
  const res = await axios.post(
    url,
    buffer,
    azureHeaders({ 'Content-type': 'application/octet-stream' })
  );

  console.log('persisted face id: ', res.data.persistedFaceId);
  return res.data.persistedFaceId;
};

export const trainPersonGroup = async () => {
  await axios.post(
    `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}/train`,
    null,
    azureHeaders()
  );
};

export const getTrainingStats = async () => {
  const res = await axios.get(
    `${AZURE_FACE_ENDPOINT}/face/v1.0/persongroups/${PERSON_GROUP_ID}/training`,
    azureHeaders()
  );

  console.log('traningStatus: ', res.data);
  return res.data;
};
