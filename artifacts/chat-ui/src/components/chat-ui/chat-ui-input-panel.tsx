import {
  Button,
  Container,
  FileUpload,
  FormField,
  Grid,
  SpaceBetween,
  Spinner, Textarea
} from "@cloudscape-design/components";
import { useEffect, useLayoutEffect, useState } from "react";
import { ChatScrollState } from "./chat-ui";
import { ChatMessage, ChatMessageType } from "./types";
import config from "../../config.json";
import { StorageHelper } from "../../common/helpers/storage-helper";
import axios from "axios";
import { AuthHelper } from "../../common/helpers/auth-help";
import { Amplify } from 'aws-amplify';


var ws = null;
var agent_prompt_flow = []
var msgs = null
var b64_content = []
var user_content = []

export interface ChatUIInputPanelProps {
  inputPlaceholderText?: string;
  sendButtonText?: string;
  running?: boolean;
  messages?: ChatMessage[];
  selected_model_option?: string;
  selected_language?: string;
  check_vector_db?: boolean;
  onSendMessage?: (message: string, type: string) => void;
  userinfo?: any;
}

export default function ChatUIInputPanel(props: ChatUIInputPanelProps) {
  const [inputText, setInputText] = useState("");
  const [value, setValue] = useState<File[]>([]);
  const socketUrl = config.websocketUrl;

  useEffect(() => {
    const onWindowScroll = () => {
      if (ChatScrollState.skipNextScrollEvent) {
        ChatScrollState.skipNextScrollEvent = false;
        return;
      }

      const isScrollToTheEnd =
        Math.abs(
          window.innerHeight +
          window.scrollY -
          document.documentElement.scrollHeight
        ) <= 10;

      if (!isScrollToTheEnd) {
        ChatScrollState.userHasScrolled = true;
      } else {
        ChatScrollState.userHasScrolled = false;
      }
    };

    window.addEventListener("scroll", onWindowScroll);

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (ChatScrollState.skipNextHistoryUpdate) {
      ChatScrollState.skipNextHistoryUpdate = false;
      return;
    }

    if (!ChatScrollState.userHasScrolled && (props.messages ?? []).length > 0) {
      ChatScrollState.skipNextScrollEvent = true;
      window.scrollTo({
        top: document.documentElement.scrollHeight + 1000,
        behavior: "instant",
      });
    }
  }, [props.messages]);


  function load_base64(file_value) {
    if (file_value.length > 0) {
      for (var i = 0; i < file_value.length; i++) {
        var reader = new FileReader();
        reader.onload = function (e) {
          b64_content.push(e.target.result)
        };
        reader.readAsDataURL(file_value[i]);
      }
    }
  }

  const onSendMessage = () => {
    ChatScrollState.userHasScrolled = false;
    props.onSendMessage?.(inputText, ChatMessageType.Human);
    setInputText("");

    //const access_token = props.userinfo.tokens.accessToken.toString();

    if (inputText.trim() !== '') {
      if ("WebSocket" in window) {
        if (msgs) {
          agent_prompt_flow.push({ 'role': 'assistant', 'content': [{ "type": "text", "text": msgs }] })
          msgs = null
        }
        // Images/docs are attached
        if (value.length > 0) {
          AuthHelper.getUserDetails().then((output) => {
            // Upload them to S3 and pass the S3 Key in the prompt
            console.log(output.tokens.idToken.toString())
            for (var i =0; i<value.length; i++) {
            var unique_id = crypto.randomUUID()
            axios.post(
              config.apiUrl + 'file_data',
              { "content": b64_content[i], "id": unique_id },
              {headers: {authorization: "Bearer " + output.tokens.idToken.toString()}}
            ).then((result) => {
              console.log('Upload successful')
              // user_content.push({"type": "image", "source": { "type": "base64", "media_type": "image/png", "data": e.target.result }})
             // Extract file extension from base64 content
              var file_extension = result['data']['result']['file_extension']
              var file_id =  result['data']['result']['file_id']
              var media_type = 'image/' + file_extension
              var partial_s3_key = file_id+'.'+file_extension
              user_content.push({ "type": "image", "source": { "type": "base64","media_type": media_type, "file_extension": file_extension, "partial_s3_key": partial_s3_key } })
              if (i >= value.length-1) {
                user_content.push({ "type": "text", "text": inputText })
              }
              // Add user content to the agent prompt flow
              agent_prompt_flow.push({ 'role': 'user', 'content': user_content})
              if (i >= value.length-1) { 
                send_over_socket();
              }
            }).catch(function(err) {
              console.log('Upload not successful')
              console.log(err)
            })
          }
          }).catch((err) => {
            console.log(err)
          })
          
        } else {
          user_content.push({ "type": "text", "text": inputText })
          // Add user content to the agent prompt flow
          agent_prompt_flow.push({ 'role': 'user', 'content': user_content})
          send_over_socket();
        }
        
      } else {
        console.log('WebSocket is not supported by your browser.');
        agent_prompt_flow = []
      }
    }
  };

  function send_over_socket() {
    if (ws == null || ws.readyState == 3 || ws.readyState == 2) {

      ws = new WebSocket(socketUrl + "?access_token=" + sessionStorage.getItem('idToken'));
      ws.onerror = function (event) {
        console.log(event);
      };
    } else {
      var query_vector_db = 'no';
      if (props.check_vector_db) {
        query_vector_db = 'yes';
      }
      // query_vectordb allowed values -> yes/no
      ws.send(JSON.stringify({
        query: JSON.stringify(agent_prompt_flow),
        behaviour: 'advanced-rag-agent',
        'query_vectordb': query_vector_db,
        'model_id': props.selected_model_option,
        'language': props.selected_language,
      }));
      user_content = [];
      setValue([]);

    }

    ws.onopen = () => {
      var query_vector_db = 'no';
      if (props.check_vector_db) {
        query_vector_db = 'yes';
      }
      // query_vectordb allowed values -> yes/no
      ws.send(JSON.stringify({
        query: JSON.stringify(agent_prompt_flow),
        behaviour: 'advanced-rag-agent',
        'query_vectordb': query_vector_db,
        'model_id': props.selected_model_option,
        'language': props.selected_language
      }));
      user_content = [];
      setValue([]);
    };

    ws.onmessage = (event) => {
      if (event.data.includes('message')) {
        var evt_json = JSON.parse(event.data);
        props.onSendMessage?.(evt_json['message'], ChatMessageType.AI);
      }
      else {
        var chat_output = JSON.parse(atob(event.data));
        if ('text' in chat_output) {
          if (msgs) {
            msgs += chat_output['text'];
          } else {
            msgs = chat_output['text'];
          }

          if (msgs.endsWith('ack-end-of-msg')) {
            msgs = msgs.replace('ack-end-of-msg', '');
          }
          props.onSendMessage?.(msgs, ChatMessageType.AI);
        } else {
          // Display errors
          props.onSendMessage?.(chat_output, ChatMessageType.AI);
        }
      }

    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      agent_prompt_flow = [];
    };
  }

  function capitalizeFirstLetter(val) {
    return val.charAt(0).toUpperCase() + val.slice(1);
  }

  const OnTextareaKeyDown = (event) => {
    if (!props.running && event.detail.key === "Enter" && !event.detail.shiftKey) {
      event.preventDefault()
      onSendMessage();
    }
  }

  return (<Container disableContentPaddings disableHeaderPaddings variant="embed">
    <Grid gridDefinition={[
      { colspan: { xxs: 6, xs: 8, s: 8, m: 10, l: 10, xl: 10 } },
      { colspan: { xxs: 2, xs: 2, s: 2, m: 1, l: 1, xl: 1 } },
      { colspan: { xxs: 4, xs: 2, s: 2, m: 1, l: 1, xl: 1 } }]}
      >
      <Textarea
        spellcheck={true}
        rows={3}
        autoFocus
        onKeyDown={(event) => OnTextareaKeyDown(event)}
        onChange={({ detail }) => setInputText(detail.value)}
        value={inputText}
        placeholder={props.inputPlaceholderText ?? "Send a message"}
      />

      <FormField label="" description="" >
        <FileUpload
          onChange={({ detail }) => {
            setValue(detail.value)
            load_base64(detail.value)
          
          }
        }
          value={value}
          i18nStrings={{
            uploadButtonText: e =>
              e ? "Choose files" : "",
            dropzoneText: e =>
              e
                ? "Drop files to upload"
                : "Drop file to upload",
            removeFileAriaLabel: e =>
              `Remove file ${e + 1}`,
            limitShowFewer: "Show fewer files",
            limitShowMore: "Show more files",
            errorIconAriaLabel: "Error"
          }}
          showFileLastModified
          showFileSize
          showFileThumbnail
          tokenLimit={3}
        />
      </FormField>



      <Button
        disabled={props.running || inputText.trim().length === 0}
        onClick={onSendMessage}
        iconAlign="right"
        iconName={!props.running ? "angle-right-double" : undefined}
        variant="primary" >
        {props.running ? (
          <>
            Loading&nbsp;&nbsp;
            <Spinner />
          </>
        ) : (
          <>{props.sendButtonText ?? "Send"}</>
        )}
      </Button>
    </Grid>
  </Container>);
}