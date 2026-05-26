import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

app.use(cors());
app.use(express.json());

app.get('/token', async (req, res) => {
  const { room, username } = req.query;

  if (!room || !username) {
    return res.status(400).json({ error: 'room and username are required' });
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: username,
  });

  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
  });

  res.json({ token: await token.toJwt() });
});

app.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});