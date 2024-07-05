import { useState, useEffect } from "react";
import { Routes, Route, HashRouter } from 'react-router-dom';
import { AppLayout, TopNavigation, SideNavigation } from '@cloudscape-design/components';
import { Hub } from 'aws-amplify/utils';
import { signOut } from 'aws-amplify/auth';
import { AppContext } from "./common/context";
import { NotFound, ChatPage, AgentPage, OcrPage, SentimentPage, HomePage } from './pages'
import '@aws-amplify/ui-react/styles.css';

export default function App() {
  const [activeHref, setActiveHref] = useState("#/");
  const [utility, setUtility] = useState([])
  const [appData , setAppData] = useState({ userinfo: null})
  const Router = HashRouter;

  useEffect(() => {
    Hub.listen("auth", (data) => {
      console.log(data)
      switch (data.payload.event) {
        case "signedOut":
          setAppData({ userinfo: null  })
          break;
      }
    })
  }, [])

  useEffect(() => {
    if(appData.userinfo != null){
      setUtility([{
        type: "menu-dropdown",
        text: "Profile",
        description: appData.userinfo.signInDetails.loginId,
        iconName: "user-profile",
        onItemClick: (e) => { 
          if (e.detail.id == 'signout') { signOut({ global: true })} 
        },
        items: [
          { id: "signout", text: "Sign out" }
        ]
      }])
    }else{
      setUtility([])
    }
  },[appData])

  
  return (
    <AppContext.Provider value={appData}>
      <div id="custom-main-header" style={{ position: 'sticky', top: 0, zIndex: 1002 }}><TopNavigation
        identity={{
          href: '#',
          title: 'Serverless Rag Demo',
        }}

        utilities={[
          {
            type: "button",
            text: "Github",
            href: "https://github.com/aws-samples/serverless-rag-demo",
            external: true,
            externalIconAriaLabel: " (opens in a new tab)"
          },
          ...utility
        ]}
      /></div>
      <AppLayout
        disableContentPaddings
        headerSelector='#custom-main-header'
        toolsHide
        navigation={<SideNavigation
          activeHref={activeHref}
          header={{ href: "#/", text: "Apps" }}
          onFollow={event => {
            if (!event.detail.external) {
              setActiveHref(event.detail.href);
            }
          }}
          items={[
            { type: "link", text: "Document Chat", href: "#/document-chat" },
            { type: "link", text: "Multi-Agent", href: "#/multi-agent" },
            { type: "link", text: "Sentiment Analysis", href: "#/sentiment-analysis" },
            { type: "link", text: "OCR", href: "#/ocr" },
          ]}
        />}
        content={
          <Router>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/document-chat" element={<ChatPage setAppData={setAppData}/>} />
              <Route path="/sentiment-analysis" element={<SentimentPage setAppData={setAppData}/>} />
              <Route path="/multi-agent" element={<AgentPage setAppData={setAppData}/>} />
              <Route path="/ocr" element={<OcrPage setAppData={setAppData}/>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        }
      />
    </AppContext.Provider>
  );
}
