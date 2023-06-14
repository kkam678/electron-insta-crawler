const mariadb = require("mariadb");
const fs = require("fs");
const dotenv = require("dotenv");
const axios = require("axios");
const FormData = require("form-data");
// 커스텀 경로에 있는 환경 변수 파일 경로
const INSTAGRAM_USER_ACCOUNT = "taghaseon";
const INSTAGRAM_USER_PASSWORD = "gktjs1379@";
const API_HOST = "https://fanjoy.kr";
// 환경 변수 파일 읽기
const envConfig = dotenv.config({ path: ".env" }).parsed;

// 환경 변수 설정
const envVars = dotenv.parse(envConfig);
for (const key in envVars) {
  process.env[key] = envVars[key];
}

const PORT = 3001;

const puppeteer = require("puppeteer");
const SITE_URL = "https://fanjoy.kr";
const INSTAGRAM_URL = "https://www.instagram.com/";
const BASE_PATH = "./";
// const BASE_PATH = "/Users/jeongminsu/PhpstormProjects/fanjoy";
const FILE_PATH = `${BASE_PATH}/app/data/instagram_feed`;
/**
 * 인스타그램의 구조가 바뀌면 아래 상수를 변경하여 적용함.
 */

/**
 * 리스트 페이지 타겟
 */
const FOLLOWERS_TARGET = "header section ul li:nth-child(2) span";
const FOLLOWINGS_TARGET = "header section ul li:nth-child(3) span";
const POSTS_TARGET = "header section ul li:first-child span";
const LIST_ITEM_TARGET = "article div a";
const LIST_ITEM_MASK_TARGET =
  "div[style*='background: rgba(0, 0, 0, 0.3)'] ul li:nth-child(2) span:nth-child(1) span";
/**
 * 여기부터는 상세페이지 타켓
 */
const FEED_WRAPPER_TARGET = "main";
const FEED_IMG_MULTI_TARGET = `${FEED_WRAPPER_TARGET} div li img`;
const FEED_NEXT_BUTTON_TARGET = `${FEED_WRAPPER_TARGET} div button[aria-label="다음"]`;
const FEED_IMG_TARGET = `${FEED_WRAPPER_TARGET} article div img`;
const FEED_VIDEO_TARGET = `${FEED_WRAPPER_TARGET} div img`;
const FEED_DESC_TARGET = `${FEED_WRAPPER_TARGET} div li div div div h1`;
const FEED_LIKE_TARGET = `${FEED_WRAPPER_TARGET} section div span span span`;

let isLogin = false;

module.exports.intagramCrawling = async (
  instagraAccount = INSTAGRAM_USER_ACCOUNT,
  instagraPassword = INSTAGRAM_USER_PASSWORD,
  dbHost = process.env.DB_HOST,
  dbPort = process.env.DB_PORT,
  dbUser = process.env.DB_USER,
  dbPassword = process.env.DB_PASSWORD
) => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      // "--disable-setuid-sandbox",
    ],
  });
  const conn = await mariadb.createConnection({
    host: dbHost,
    user: dbPort,
    password: dbUser,
    database: dbPassword,
  });
  let snsUrlId = 0;
  try {
    const [lastProcees] = await conn.query(
      "select sns_url_id from instagram_crawling_proceed where id = 1"
    );

    let where = "";
    if (lastProcees.sns_url_id > 0) {
      where += ` and id >= ${lastProcees.sns_url_id}`;
    }
    const result = await conn.query(
      `SELECT id,url,wr_id FROM influencer_sns_url where sns_id = 4 and is_validate = 1 ${where} order by id asc`
    );
    let page = await browser.newPage();
    // 요청 헤더 설정
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
      Referer: "https://www.google.com/",
    });
    let i = 0;
    for (const row of result) {
      await page.setViewport({ width: 1200, height: 800 });
      let { id, url, wr_id } = row;
      await conn.query(
        `update instagram_crawling_proceed set sns_url_id = ${id} where id = 1`
      );

      snsUrlId = id;
      let regex = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/[\w.-]+\/?$/;
      if (!regex.test(url)) {
        await conn.query(
          `update influencer_sns_url set is_validate = 0 where id = ${id}`
        );
        continue;
      }
      if (!isLogin) {
        await page.goto(INSTAGRAM_URL);
        await page.waitForSelector('input[name="password"]');
        await waitTime(2000);

        await page.type('[name="username"]', instagraAccount);
        await waitTime(500);
        await page.type('[name="password"]', instagraPassword);
        await page.click('button[type="submit"]');
        await page.waitForNavigation();
      }
      isLogin = true;

      let regexAccount = /^https?:\/\/(?:www\.)?instagram\.com\/([^\/]+)/;
      let matchAccount = url.match(regexAccount);
      let account = matchAccount ? matchAccount[1] : null;

      if (!account) {
        await conn.query(
          `update influencer_sns_url set is_validate = 0 where id = ${id}`
        );
        continue;
      }
      await page.goto(`${url}`);
      // await page.waitForNavigation();
      await page.waitForSelector(FOLLOWERS_TARGET);
      await waitTime(1000);

      // Crawl profile information
      let profileInfo = await page.evaluate(
        (FOLLOWERS_TARGET, FOLLOWINGS_TARGET, POSTS_TARGET) => {
          const followers = document.querySelector(FOLLOWERS_TARGET).title;

          const following =
            document.querySelector(FOLLOWINGS_TARGET).textContent;
          const posts = document.querySelector(POSTS_TARGET).textContent;

          return {
            followers: followers.replace(/,/g, ""),
            following: following.replace(/,/g, ""),
            posts: posts.replace(/,/g, ""),
          };
        },
        FOLLOWERS_TARGET,
        FOLLOWINGS_TARGET,
        POSTS_TARGET
      );

      await conn.query(
        `insert into instagram_profile (
        account,
        influencer_id,
        followers,
        followings,
        posts,
        updated_at
      ) VALUES (   
          '${account}',
          ${wr_id},
          '${profileInfo.followers}',
          '${profileInfo.following}',
          '${profileInfo.posts}',
          NOW()
      )
        ON DUPLICATE KEY UPDATE
          followers='${profileInfo.followers}'
          ,followings='${profileInfo.following}'
          ,posts='${profileInfo.posts}'
          ,updated_at=NOW()
        `
      );

      let [rows] = await conn.query(
        `select id from instagram_profile where account = '${account}'`
      );
      let profileId = rows?.id ?? 0;

      // Crawl post information
      let posts = [];
      profileInfo = null;
      regexAccount = null;
      matchAccount = null;
      account = null;
      id = null;
      url = null;
      try {
        await page.waitForSelector(LIST_ITEM_TARGET);
        await waitTime(1000);
        let link = await page.$(LIST_ITEM_TARGET);
        // 마우스 오버 이벤트 발생
        await link.hover();
        // 마우스 오버 이벤트가 발생하면 나타나는 DOM 요소에서 정보 추출
        let commentsElement = await page.$(LIST_ITEM_MASK_TARGET);
        let comments = await page.evaluate(
          (element) => element?.textContent ?? "",
          commentsElement
        );
        let href = await link.getProperty("href");
        let hrefValue = await href.jsonValue();
        let svg = await link.$("svg");
        let type = "image";
        if (svg) {
          let label = await svg.getProperty("aria-label");
          let labelValue = await label.jsonValue();
          if (labelValue === "클립") {
            type = "video";
          } else if (labelValue === "슬라이드") {
            type = "multi";
          }
        }
        let img = await link.$("img");
        let src = await img.getProperty("src");
        let originUrl = await src.jsonValue();
        console.log("@@@@@@@@@@@@@@");
        console.log("imgCheck:::", type, originUrl);
        console.log("@@@@@@@@@@@@@@");
        let { thumbUrl, filePath, fileName } = await saveFile(originUrl);
        await uploadFile(filePath, fileName);

        img = null;
        originUrl = null;
        posts.push({
          link: hrefValue,
          comments: comments,
          type: type,
          thumbUrl: thumbUrl,
        });
        link = null;
        commentsElement = null;
        comments = null;
        href = null;
        hrefValue = null;
        svg = null;
        type = null;
        thumbUrl = null;
      } catch (error) {
        console.error("Error:", error);
      }

      console.log("LinkItems::", posts);

      // Iterate through post links and extract information
      for (const post of posts) {
        await page.goto(post.link);
        await waitTime(1000);
        let regexShortCode = /\/p\/(.+)\//;
        if (!regexShortCode.test(post.link)) continue;
        let match = post.link.match(regexShortCode);

        let shortCode = match[1];
        let postData = await page.evaluate(
          (FEED_DESC_TARGET, FEED_LIKE_TARGET) => {
            const description =
              document.querySelector(FEED_DESC_TARGET)?.textContent || "";
            const likes =
              document.querySelector(FEED_LIKE_TARGET)?.textContent || "";

            return {
              description,
              likes: likes.replace(/,/g, ""),
            };
          },
          FEED_DESC_TARGET,
          FEED_LIKE_TARGET
        );

        await conn.query(
          `insert into instagram_feed (
          short_code,
          profile_id,
          thumb_url,
          like_count,
          type,
          comment_count,
          content          
        ) VALUES (               
            '${shortCode}',
            '${profileId}',
            '${post.thumbUrl}',
            '${postData.likes}',
            '${post.type}',
            '${post.comments}',
            ${conn.escape(postData.description)}            
        )
          ON DUPLICATE KEY UPDATE
            profile_id = '${profileId}',
            thumb_url = '${post.thumbUrl}',
            like_count = '${postData.likes}',
            type = '${post.type}',
            comment_count = '${post.comments}',
            content  = ${conn.escape(postData.description)}
          `
        );
        postData = null;
        regexShortCode = null;
        match = null;
        shortCode = null;
        profileId = null;
        rows = null;
        i++;
        if (i + 1 >= result.length) {
          await conn.query(
            `update instagram_crawling_proceed set sns_url_id = 0 where id = 1`
          );
        }
      }
      posts = null;

      await waitTime(1000);
    }
  } catch (e) {
    //실패한 경우 유효성 체크 update
    await conn.query(
      `update influencer_sns_url set is_validate = 0 where id = ${snsUrlId}`
    );
    await browser.close();
    console.log("ERROR:::", e);
  } finally {
    await browser.close();
  }
};

async function waitTime(milliseconds = 1000) {
  const min = 100;
  const max = 500;
  const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
  return await new Promise((r) => setTimeout(r, milliseconds + randomNumber));
}

async function saveFile(originUrl) {
  const date = new Date();
  const year = date.getFullYear();
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const day = ("0" + date.getDate()).slice(-2);
  const filePath = `${FILE_PATH}/${year}/${month}/${day}`;
  const fileName = originUrl
    .substring(originUrl.lastIndexOf("/") + 1)
    .split("?")[0];

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(filePath, { recursive: true });
  }

  const file = fs.createWriteStream(`${filePath}/${fileName}`);
  const response = await axios.get(originUrl, { responseType: "stream" });
  //   const response = await fetch(originUrl);
  const thumbUrl = await new Promise(async (resolve, reject) => {
    try {
      response.data.pipe(file);

      await new Promise((resolve, reject) => {
        file.on("finish", () => {
          console.log("Image saved!");
          resolve();
        });

        file.on("error", (error) => {
          console.log("Error while saving the image:", error);
          reject(error);
        });
      });

      const thumbUrl = `${filePath}/${fileName}`.replace(BASE_PATH, SITE_URL);
      resolve(thumbUrl);
    } catch (error) {
      reject(error);
    }
  });

  return {
    thumbUrl: thumbUrl,
    filePath: filePath,
    fileName: fileName,
  };
}

async function uploadFile(filePath, fileName) {
  const form = new FormData();

  // Append file data to form
  form.append("file", fs.createReadStream(`${filePath}/${fileName}`));

  // Append other data to form
  form.append("filepath", filePath.replace(`${FILE_PATH}/`, ""));
  form.append("filename", fileName);

  try {
    // Make HTTP POST request with form data
    const response = await axios.post(
      `${API_HOST}/app/api/instagram/file-upload.php`,
      form,
      {
        headers: form.getHeaders(),
      }
    );
    console.log(response.data);
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message);
    }
  }
}
