import React from "react";
import Peer from "simple-peer";
import io from "socket.io-client";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import { List, ListItem, ListItemText, ListItemIcon, Divider, CardMedia } from "@material-ui/core";
import { v1 as uuidv1 } from "uuid";
import { makeStyles, Theme, createStyles } from "@material-ui/core/styles";
import Modal from "@material-ui/core/Modal";
import Fade from "@material-ui/core/Fade";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import Container from "@material-ui/core/Container";
import Typography from "@material-ui/core/Typography";

interface VideoChatProps {
  classes: any;
  users: string[];
  socket: SocketIOClient.Socket;
  username?: string;
}

interface VideoChatState {
  gotAnswer: boolean;
  stream: MediaStream | undefined;
  peer: Peer.Instance | null;
  peerVideo: any;
  inVideoChat: boolean;
  name: string | undefined;
  videoChatSet: string[];
  videoChatId: any;
  openInviteModal: boolean;
  inviteFrom: string;
  peerConnected: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  inviteFromName: string;
}

interface PeerType {
  init: "init";
  notInit: "notInit";
}

enum PeerTypes {
  init = "init",
  notInit = "notInit"
}

interface Client {
  gotAnswer: any;
  peer: any;
}

class VideoChat extends React.Component<VideoChatProps, VideoChatState> {
  private videoRef: React.RefObject<HTMLVideoElement>;
  private peerVideoRef: React.RefObject<HTMLVideoElement>;
  private socket: SocketIOClient.Socket;

  constructor(props: VideoChatProps) {
    super(props);
    this.socket = this.props.socket;
    this.state = {
      peerConnected: false,
      gotAnswer: false,
      stream: undefined,
      peer: null,
      peerVideo: null,
      inVideoChat: false,
      name: "",
      inviteFromName: "",
      videoChatSet: [],
      videoChatId: null,
      openInviteModal: false,
      inviteFrom: "",
      videoTrack: null,
      audioTrack: null
    };
    this.videoRef = React.createRef();
    this.peerVideoRef = React.createRef();
    this.createVideo = this.createVideo.bind(this);
    this.createVideo = this.createVideo.bind(this);
    this.makePeer = this.makePeer.bind(this);
    this.init = this.init.bind(this);
    this.setVideoChatSet = this.setVideoChatSet.bind(this);
    this.acceptVideoChatInvite = this.acceptVideoChatInvite.bind(this);
  }

  componentDidMount() {
    const { username } = this.props;
    this.videoRef?.current?.addEventListener("ended", () => console.log("ended"));
    this.peerVideoRef?.current?.addEventListener("ended", () => console.log("ended"));
    this.socket.on("BackOffer", this.frontAnswer);
    this.socket.on("BackAnswer", this.signalAnswer); //if answer is from backend, handle, connect both clients
    this.socket.on("SessionActive", () => console.log("Session Active"));
    this.socket.on("CreatePeer", this.makePeer);
    this.socket.on("VIDEOCHAT_LIST", (data: string[]) => this.setVideoChatSet(data));
    this.socket.on("SEND_INVITE", (invite: any) => {
      this.openInviteModal(invite);
    });
    this.socket.on("ACCEPT_INVITE", (accept: any) => {
      this.sendVideoChatId(accept);
    });

    this.socket.on("SEND_VIDEOCHATID", (videoChatIdObj: any) => {
      this.setVideoChatIdAndSetInVideoChat(videoChatIdObj.id);
    });
    this.socket.on("LEAVE_VIDEO_CHAT", () => this.stopMyVideoChat(false));
    this.setState({ name: username });
  }

  componentDidUpdate(prevProps: VideoChatProps) {
    if (this.props.username !== prevProps.username) {
      this.setState({ name: this.props.username });
    }
  }

  setInVideoChat = () => {
    this.setState({ inVideoChat: true });
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true }) // this asks browser for permission to access cam/aud
      .then((stream) => {
        this.setState({ stream: stream });
        const node = this.videoRef.current;
        //TODO: Include id in this emit
        this.socket.emit("newVideoChatPeer", this.state.videoChatId); //handled in server.js
        if (node) {
          node.srcObject = stream;
        }

        this.setState({
          videoTrack: stream.getTracks()[1],
          audioTrack: stream.getTracks()[0]
        });
      })
      .catch(() => console.log("Permission Not Given"));
  };

  stopMyVideoChat = (emit: boolean) => {
    this.state.videoTrack?.stop();
    this.state.audioTrack?.stop();
    if (emit) {
      this.socket.emit("LEAVE_VIDEO_CHAT", this.state.videoChatId);
    }
    this.setState({
      videoTrack: null,
      audioTrack: null,
      inVideoChat: false,
      peerConnected: false,
      gotAnswer: false,
      stream: undefined,
      peer: null,
      peerVideo: null,
      videoChatSet: [],
      videoChatId: null,
      openInviteModal: false,
      inviteFrom: ""
    });
    //TODO: SEND Leave video chat event to other use in video chat
    //On receipt, they should stop stopVideoChat
  };

  setVideoChatIdAndSetInVideoChat = (id: any) => {
    this.setState({ videoChatId: id });
    this.socket.emit("VIDEO_CHAT", this.state.videoChatId);
    this.setInVideoChat();
  };

  sendVideoChatId = (accept: any) => {
    const videoChatId = uuidv1();
    const videoChatIdObj = { id: videoChatId, receiver: accept.sender };
    this.setVideoChatIdAndSetInVideoChat(videoChatIdObj.id);
    this.socket.emit("SEND_VIDEOCHATID", videoChatIdObj);
  };

  openInviteModal = (invite: any) => {
    this.setState({ inviteFrom: invite.sender, inviteFromName: invite.name });
    this.setState({ openInviteModal: true });
  };

  sendInvite = (receiverId: string) => {
    const name = this.state.name && this.state.name;
    const invite = { sender: this.socket.id, receiver: receiverId, name: name };
    this.socket.emit("SEND_INVITE", invite);
  };

  setVideoChatSet = (arr: string[]) => {
    this.setState({ videoChatSet: arr });
  };

  acceptVideoChatInvite = () => {
    const accept = { sender: this.socket.id, receiver: this.state.inviteFrom };
    this.socket.emit("ACCEPT_INVITE", accept);
    this.setState({ openInviteModal: false });
  };

  declineVideoChatInvite = () => {
    //TODO: Send an event that says declined?
    this.setState({ openInviteModal: false });
  };

  //Used to initialize a peer, define a new peer and return it
  init = (type: PeerTypes): Peer.Instance => {
    const socket = this.socket;
    const peer = new Peer({
      initiator: type === PeerTypes.init ? true : false,
      stream: this.state.stream && this.state.stream,
      trickle: false
    });

    const peerNode = this.peerVideoRef.current;
    peer.on("stream", (stream) => {
      this.setState({ peerConnected: true });
      if (peerNode) {
        peerNode.srcObject = stream;
      }
    });
    peer.on("close", () => {
      this.setState({ peerConnected: false });
      this.setState({ inVideoChat: false });
      peer.destroy();
    });

    peer.on("error", (err) => {
      this.setState({ inVideoChat: false });
    });
    return peer;
  };

  makePeer = (): void => {
    const gotAnswer = this.state.gotAnswer;
    const socket = this.socket;
    const videoChatId = this.state.videoChatId;
    const peer = this.init(PeerTypes.init);
    peer.on("signal", function (data) {
      if (!gotAnswer) {
        const offerObj = { data: data, videoChatId: videoChatId };
        socket.emit("Offer", offerObj);
      }
    });
    this.setState({ peer: peer });
  };

  frontAnswer = (offer: any): void => {
    const peer = this.init(PeerTypes.notInit);
    const socket = this.socket;
    const videoChatId = this.state.videoChatId;
    peer.on("signal", (data) => {
      const answerObj = { data: data, videoChatId: videoChatId };
      socket.emit("Answer", answerObj);
    });
    peer.signal(offer);
  };

  // handles when answer comes from backend
  // if answer comes from backend, set the client.gotAnswer to true, and signalAnswerView to peer,
  // then finally both the clients will be connected
  signalAnswer = (answer: any): void => {
    this.setState({ gotAnswer: true });
    const peer = this.state.peer;
    peer?.signal(answer);
  };

  createVideo = (stream: any): void => {
    const peerNode = this.peerVideoRef.current;
    if (peerNode) {
      peerNode.srcObject = stream;
      this.setState({ peerVideo: stream });
    }
  };

  render() {
    const { classes, users } = this.props;
    return (
      <React.Fragment>
        {!this.state.inVideoChat && (
          <React.Fragment>
            <List className={classes.list} component="nav">
              <h1 className={classes.videoChatHeader}>VIDEO CHAT</h1>
              {Object.entries(users).map((user) => {
                if (user[1]) {
                  return (
                    <React.Fragment>
                      <ListItem className={classes.listItem} divider>
                        <ListItemText primary={user[1]} />
                        <ListItemIcon className={classes.listItemIcon} onClick={() => this.sendInvite(user[0])}>
                          <FontAwesomeIcon icon={faVideo} />
                        </ListItemIcon>
                      </ListItem>
                      <Divider className={classes.divider} light />
                    </React.Fragment>
                  );
                }
                return null;
              })}
            </List>
          </React.Fragment>
        )}

        {this.state.inVideoChat && (
          <div className={classes.videoChat}>
            <CardMedia className={classes.cardMedia}>
              <video style={{ objectFit: "contain", width: "30vw" }} ref={this.peerVideoRef} autoPlay></video>
            </CardMedia>
            <Button onClick={() => this.stopMyVideoChat(true)} variant="contained" color="secondary">
              Leave
            </Button>
          </div>
        )}

        <Modal
          disableAutoFocus={true}
          aria-labelledby="transition-modal-title"
          aria-describedby="transition-modal-description"
          className={classes.modal}
          open={this.state.openInviteModal}
          onClose={() => console.log("onClose modal")}
          closeAfterTransition
        >
          <Fade in={this.state.openInviteModal}>
            <div className={classes.paper}>
              <Typography gutterBottom align="center" variant="h6">
                Video chat invite from {this.state.inviteFromName}
              </Typography>
              <Container style={{ textAlign: "center" }}>
                <Button className={classes.inviteButtons} onClick={this.acceptVideoChatInvite}>
                  Accept
                </Button>
                <Button className={classes.inviteButtons} onClick={this.declineVideoChatInvite}>
                  Decline
                </Button>
              </Container>
            </div>
          </Fade>
        </Modal>
      </React.Fragment>
    );
  }
}

const materialUiStyles = {
  root: {
    background: "#000000",
    height: "292px",
    width: "212px",
    marginRight: "50px",
    marginLeft: "50px",
    border: "2px solid #051633",
    borderRadius: "10px",
    opacity: "1 !important"
  },
  textPrimary: {
    color: "white"
  },
  modal: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  paper: {
    background: "rgba(34,34,34,0.85)",
    border: "1px solid #000",
    padding: "3em",
    borderRadius: "20px",
    outline: "none",
    color: "white"
  },
  list: {
    background: "rgba(255, 255, 255, 0.05)",
    marginBottom: "2em",
    minHeight: "30vh"
  },
  listItem: {
    color: "#ffffff"
  },
  listItemIcon: {
    color: "#ffffff"
  },
  divider: {
    backgroundColor: "#ffffff"
  },
  cardMedia: {
    width: "300px"
  },
  videoChatHeader: {
    fontFamily: "Roboto, sans-serif",
    fontStyle: "normal",
    fontWeight: 500,
    fontSize: 24,
    color: "rgba(255, 255, 255, 0.4)",
    maxHeight: 15,
    paddingLeft: "16px",
    paddingRight: "16px"
  },
  videoChat: {
    marginBottom: "2em"
  },
  inviteButtons: {
    backgroundColor: "white",
    color: "#001953",
    "&:hover": {
      backgroundColor: "#001953",
      color: "white"
    },
    margin: "1em 1em"
  }
};

export default withStyles(materialUiStyles)(VideoChat);
