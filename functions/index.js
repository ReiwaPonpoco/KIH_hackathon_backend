const functions = require("firebase-functions");
const axios = require("axios");
const cors = require("cors")({origin: true});
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * ほんとはindex.jsに分割したjsを読み込む方がいいんだけども、
 * 分けたら、デプロイで構文エラーが起きてしまって、なかなか直せなかったので、
 * 全部index.jsに記述しちゃいます。
 */

/**
 * 翻訳を行うエンドポイントを設定: POST
 * req: 言語設定, コンテンツ
 * res: コンテンツ
 */
exports.translateContent = functions.https.onRequest((req, res) => {
  // CORSポリシーを適用して、クロスオリジンのリクエストを処理する
  cors(req, res, async () => {
    // リクエストのボディから翻訳するテキストとターゲット言語を取得
    const text = req.body.text;
    const targetLanguage = req.body.target;

    // Firebaseの設定からGoogle Translate APIのキーを取得
    const apiKey = functions.config().googletranslateapi.key;

    // Google Translate APIのURLを設定
    const url = "https://translation.googleapis.com/language/translate/v2";

    try {
      // APIにPOSTリクエストを送信して翻訳を実行
      const response = await axios.post(url, null, {
        params: {
          key: apiKey,
          source: "en",
          target: targetLanguage,
          q: text,
        },
      });

      // 正しい応答が返された場合、翻訳されたテキストを返す
      if (response.data && response.data.data && response.data.data.translations) {
        res.status(200).send({
          translatedText: response.data.data.translations[0].translatedText,
        });
      // それ以外の場合、エラーメッセージを返す
      } else {
        res.status(400).send({error: "Invalid response from the API"});
      }
    // APIの呼び出し中にエラーが発生した場合、エラーを返す
    } catch (error) {
      res.status(500).send({error: "Translation failed"});
    }
  });
});

/**
 * 位置情報からその周辺の地理情報を返すエンドポイントの設定 GET
 * req: 緯度経度
 * res: JSON
 */
exports.getPlaces = functions.https.onRequest((req, res) => {
  // CORSポリシーを適用して、クロスオリジンのリクエストを処理する
  cors(req, res, async () => {
    // クエリから緯度と経度を取得、もしくはデフォルトの値を使用
    const latitude = req.query.latitude || 35.6895;
    const longitude = req.query.longitude || 139.6917;

    // Firebaseの設定からGoogle Maps APIのキーを取得
    const apiKey = functions.config().googlemapsapi.key;

    // 検索の範囲をメートル単位で設定
    const radius = 50;

    // 検索の範囲をメートル単位で設定
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&key=${apiKey}`;

    try {
      // APIを呼び出して、レスポンスを取得
      const response = await axios.get(url);
      const data = response.data;

      // データが正しければ、結果を返す
      if (data.status === "OK") {
        res.send(data.results);
      // それ以外の場合、エラーメッセージを返す
      } else {
        res.status(400).send(data);
      }
    // API呼び出し中にエラーが発生した場合、エラーを返す
    } catch (error) {
      res.status(500).send(error);
    }
  });
});

/**
 * firestoreを用いて、お気に入りリストを返すエンドポイント: GET
 * req: userId
 * res: list
 */
exports.getFavorites = functions.https.onCall((data, context) => {
  // 認証されていないユーザーからのリクエストを拒否
  if (!context.auth) {
    return {message: "Authentication Required!", code: 401};
  }

  // 認証されたユーザーのIDを取得
  const userId = context.auth.uid;
  // ユーザーのお気に入りデータへの参照を取得
  const favoritesRef = admin.firestore().collection("favorite").doc(userId);

  // Firestoreからデータを取得
  return favoritesRef.get().then((doc) => {
    if (doc.exists) {
      return doc.data();
    } else {
      return {message: "No favorites found", code: 404};
    }
  });
});

/**
 * firestoreを用いて、お気に入りリストを登録するエンドポイント: POST
 * req: favorite_place_id, place_name, favorite_description, user_id
 * res: success
 */
exports.postFavorite = functions.https.onRequest(async (req, res) => {
  // CORSを適用
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(400).send("Please send a POST request");
    }

    // 認証されていないユーザーからのリクエストを拒否
    if (!req.auth) {
      return res.status(401).send("Authentication required");
    }

    const favorite = {
      favorite_place_id: req.body.favorite_place_id,
      place_name: req.body.place_name,
      favorite_description: req.body.favorite_description,
      user_id: req.auth.uid, // 認証からユーザーIDを取得
    };

    try {
      const docRef = await admin.firestore().collection("favorite").add(favorite);
      res.status(200).send({success: true, id: docRef.id});
    } catch (error) {
      res.status(500).send(error);
    }
  });
});
